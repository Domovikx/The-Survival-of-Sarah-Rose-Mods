/**
 * translate_clause_trim.mts — обрезка ЧАСТИЧНЫХ вклеек соседа.
 *
 * Остаток после полного «переезда текста»: строка начинается (или кончается)
 * клаузой, которая принадлежит соседу. Пример (fr #5122):
 *   наша:      «Quant à ses devoirs de père, Varga était, au contraire, …»
 *   сосед #5123: «Quant à ses devoirs de père, personne ne pouvait mieux faire…»
 * Наша клауза «Quant à ses devoirs de père» — чужая, её надо отрезать.
 *
 * Правило консервативное: режем только если клауза (≥4 слов) совпадает с
 * клаузой соседа ДОСЛОВНО, оригиналы разные (sim < 0.7) и после обрезки
 * остаётся осмысленный хвост (≥ 15 символов). Не-латиница (CJK) — по подстроке
 * без пробелов, минимальная длина 6 символов.
 *
 * Запуск:
 *   node .opencode/skills/translate/translate_clause_trim.mts fr            # план
 *   node .opencode/skills/translate/translate_clause_trim.mts fr --apply
 *   ... --po <путь> --min-words 5
 */
import { readFileSync, writeFileSync } from "node:fs";

import { parsePo, renderPo, writePoAtomic } from "../renpy-po/po_core.mts";

const args = process.argv.slice(2);
const LANG = args[0] ?? "fr";
const APPLY = args.includes("--apply");
const wordsAt = args.indexOf("--min-words");
const MIN_WORDS = wordsAt >= 0 ? Number(args[wordsAt + 1]) : 4;
const poAt = args.indexOf("--po");
const PO = poAt >= 0 ? args[poAt + 1]! : `patches/ai-voice-pack/po/${LANG}.po`;
const MIN_TAIL = 15;

const sim = (a: string, b: string): number => {
  const words = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .split(/\s+/)
      .filter(Boolean);
  const A = words(a);
  const B = words(b);
  if (!A.length || !B.length) return 0;
  const setB = new Set(B);
  return A.filter((w) => setB.has(w)).length / Math.max(A.length, B.length);
};

/** Клаузы: делим по знакам конца фразы, сохраняя разделители. */
const clauses = (s: string): string[] =>
  s
    .split(/(?<=[.!?…;:])\s+/)
    .map((c) => c.trim())
    .filter(Boolean);

const text = readFileSync(PO, "utf-8").replace(/\r\n/g, "\n");
const entries = parsePo(text);
const rows = entries.filter((e) => e.msgid);

type Fix = { i: number; j: number; side: "начало" | "конец"; clause: string; before: string; after: string };
const fixes: Fix[] = [];

for (let i = 0; i < rows.length; i++) {
  const me = rows[i]!;
  if (!me.msgstr.trim()) continue;
  for (const j of [i - 1, i + 1]) {
    const n = rows[j];
    if (!n || !n.msgstr.trim()) continue;
    if (sim(me.msgid, n.msgid) >= 0.7) continue; // один оригинал — не склейка
    const mine = clauses(me.msgstr);
    const theirs = new Set(clauses(n.msgstr).map((c) => c.toLowerCase()));
    if (mine.length < 2) continue;
    for (const side of ["начало", "конец"] as const) {
      const clause = side === "начало" ? mine[0]! : mine[mine.length - 1]!;
      // CJK — по СКРИПТУ, а не «нет пробелов»: «Oui...» тоже без пробелов, и
      // старое условие считало его CJK (порог 6 символов вместо 4 слов) —
      // из-за этого обрезались ВЕРНЫЕ строки вроде «Oui... mais même vous…».
      const isCjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(clause);
      const okWords = isCjk ? clause.length >= 6 : clause.split(/\s+/).length >= MIN_WORDS;
      if (!okWords) continue;
      // Клауза должна принадлежать соседу: она есть в его тексте.
      const inNeighbour = isCjk
        ? n.msgstr.replace(/\s+/g, "").includes(clause)
        : [...theirs].some((c) => c.startsWith(clause.toLowerCase()) || c === clause.toLowerCase());
      if (!inNeighbour) continue;
      const rest = side === "начало" ? mine.slice(1).join(" ") : mine.slice(0, -1).join(" ");
      if (rest.trim().length < MIN_TAIL) continue;
      fixes.push({ i, j, side, clause, before: me.msgstr, after: rest.trim() });
      break;
    }
  }
}

console.log(`${LANG}: частичных вклеек найдено ${fixes.length}`);
for (const f of fixes.slice(0, 8)) {
  console.log(`  #${f.i} (${f.side}, из #${f.j}): «${f.clause}»`);
  console.log(`     было : ${f.before.slice(0, 100)}`);
  console.log(`     стало: ${f.after.slice(0, 100)}`);
}
if (fixes.length > 8) console.log(`  … и ещё ${fixes.length - 8}`);

/**
 * --verify: доказать владение клаузой переводом. Общая клауза бывает у обеих
 * строк («Ça te ferait du bien.»), и слепая обрезка портит верный перевод.
 * Режем только если клауза есть в переводе СОСЕДА и отсутствует в нашем.
 */
const VERIFY = args.includes("--verify");
let verified: Fix[] = fixes;
if (VERIFY) {
  const URL = process.env.TSSR_LLM_URL ?? "http://127.0.0.1:8081";
  const MODEL = process.env.TSSR_LLM_MODEL ?? "index-translate-9b";
  const TARGET: Record<string, string> = {
    ru: "Russian",
    es: "Spanish",
    de: "German",
    fr: "French",
    it: "Italian",
    pl: "Polish",
    pt: "Portuguese",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
  };
  const tr = async (line: string): Promise<string> => {
    const r = await fetch(`${URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `You translate this game into ${TARGET[LANG] ?? LANG}. Translate ONLY the given line. Output the translation and nothing else.`,
          },
          { role: "user", content: line },
        ],
        temperature: 0,
        max_tokens: 400,
        reasoning_effort: "none",
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return (d.choices?.[0]?.message?.content ?? "").trim();
  };
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  verified = [];
  for (const f of fixes) {
    const mine = rows[f.i]!;
    const nb = rows[f.j]!;
    const candMine = await tr(mine.msgid);
    const candNb = await tr(nb.msgid);
    const clauseN = norm(f.clause);
    const hasMine = norm(candMine).includes(clauseN);
    const hasNb = norm(candNb).includes(clauseN);
    if (hasNb && !hasMine) {
      verified.push(f);
      console.log(`  ✔ #${f.i}: клауза принадлежит соседу #${f.j} — режем`);
    } else {
      console.log(`  ✖ #${f.i}: клауза наша или неоднозначно — оставляем`);
    }
  }
  console.log(`${LANG}: подтверждено моделью ${verified.length} из ${fixes.length}`);
}

if (!APPLY) {
  console.log("применить: --apply (с --verify — только подтверждённое)");
  process.exit(0);
}
// Одна строка может попасть в список дважды (сосед слева и справа) — берём первую.
const applied = new Map<number, Fix>();
for (const f of verified) if (!applied.has(f.i)) applied.set(f.i, f);
for (const [i, f] of applied) {
  const row = rows[i]!;
  row.msgstr = f.after;
}
writeFileSync(`tmp/${LANG}.po.clausetrim-backup`, text, "utf-8");
writePoAtomic(PO, renderPo(entries.filter((e) => e.msgid), text.split("\n\n")[0]!.split("\n")));
const after = parsePo(readFileSync(PO, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);
console.log(`${LANG}: обрезано ${applied.size}, пустых после ${after.filter((e) => !e.msgstr.trim()).length}`);
