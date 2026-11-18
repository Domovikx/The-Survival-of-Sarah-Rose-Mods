/**
 * translate_pairfix.mts — парная починка «перевода соседа».
 *
 * Когда строка пуста, а сосед хранит перевод ЭТОЙ строки в ДРУГОЙ формулировке,
 * ни точное совпадение, ни вхождение не срабатывают: модель теперь переводит
 * иначе. Тогда решаем сравнением двух переводов:
 *
 *   cand_i = модель(EN_i)   cand_j = модель(EN_j)
 *   если msgstr_j ближе к cand_i, чем к cand_j → сосед держит НАШУ строку:
 *      наша строка получает cand_i, сосед — cand_j (его собственный перевод);
 *   иначе сосед в порядке, наша строка получает cand_i.
 *
 * Запуск:
 *   node .opencode/skills/translate/translate_pairfix.mts fr            # план
 *   node .opencode/skills/translate/translate_pairfix.mts fr --apply
 *   ... --limit 20    # только первые N строк
 *   ... --po <путь>   # другой файл (E2E)
 */
import { readFileSync, writeFileSync } from "node:fs";

import { parsePo, renderPo, writePoAtomic } from "../renpy-po/po_core.mts";

const args = process.argv.slice(2);
const LANG = args[0] ?? "fr";
const APPLY = args.includes("--apply");
const limitAt = args.indexOf("--limit");
const LIMIT = limitAt >= 0 ? Number(args[limitAt + 1]) : 0;
const poAt = args.indexOf("--po");
const PO = poAt >= 0 ? args[poAt + 1]! : (process.env.TSSR_SALVAGE_PO ?? `patches/ai-voice-pack/po/${LANG}.po`);
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

const translate = async (line: string): Promise<string> => {
  const r = await fetch(`${URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            `You translate this game into ${TARGET[LANG] ?? LANG}. Translate ONLY the given line. ` +
            "Output the translation and nothing else: no quotes, no explanations, no extra sentences.",
        },
        { role: "user", content: line },
      ],
      temperature: 0,
      max_tokens: 500,
      reasoning_effort: "none",
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (data.choices?.[0]?.message?.content ?? "")
    .trim()
    .replace(/^["«“]|["»”]$/g, "")
    .trim();
};

/** Похожесть по множествам слов (0..1) — устойчивее к перестановкам, чем edit distance. */
const sim = (a: string, b: string): number => {
  // Языки с пробелами — по словам; CJK (японский/китайский) — по символьным
  // биграммам: там нет пробелов, и словесная метрика давала 0 для любых двух
  // строк (из-за этого ja не чинился вообще).
  const hasSpace = /\s/.test(a.trim()) || /\s/.test(b.trim());
  const words = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .split(/\s+/)
      .filter(Boolean);
  const grams = (s: string): string[] => {
    const t = s.replace(/\s+/g, "");
    const out: string[] = [];
    for (let i = 0; i + 1 < t.length; i++) out.push(t.slice(i, i + 2));
    return out;
  };
  const A = hasSpace ? words(a) : grams(a);
  const B = hasSpace ? words(b) : grams(b);
  if (!A.length || !B.length) return 0;
  const setB = new Set(B);
  const common = A.filter((w) => setB.has(w)).length;
  return common / Math.max(A.length, B.length);
};

/**
 * Режим --flagged <файл>: чинит строки, которые ревью пометило как УТЕЧКА/СКЛЕЙКА.
 * Для каждой берём свой перевод, а также перевод соседа и меняем текст ТОЛЬКО
 * если текущий ближе к соседскому — иначе это ложное срабатывание (в ru таких
 * большинство: повторяющиеся обороты), и мы его не трогаем.
 */
const text = readFileSync(PO, "utf-8").replace(/\r\n/g, "\n");
const entries = parsePo(text);
const rows = entries.filter((e) => e.msgid);

if (args.includes("--flagged")) {
  const file = args[args.indexOf("--flagged") + 1]!;
  const text0 = readFileSync(file, "utf-8");
  const idx = [...text0.matchAll(/\[изменено (\d+)\]/g)].map((m) => Number(m[1]!));
  const uniq = [...new Set(idx)].filter((i) => rows[i]?.msgstr.trim());
  const workF = LIMIT ? uniq.slice(0, LIMIT) : uniq;
  console.log(`${LANG}: флагов ${uniq.length}, к проверке ${workF.length}${APPLY ? "" : " (dry-run)"}`);
  let changed = 0;
  let kept = 0;
  for (const i of workF) {
    const me = rows[i]!;
    const candSelf = await translate(me.msgid);
    if (!candSelf) continue;
    let bestNeighbour = 0;
    let bestCand = "";
    for (const j of [i - 1, i + 1]) {
      const n = rows[j];
      if (!n || !n.msgstr.trim() || sim(me.msgid, n.msgid) >= 0.7) continue;
      const cj = await translate(n.msgid);
      if (!cj) continue;
      const s = sim(me.msgstr, cj);
      if (s > bestNeighbour) {
        bestNeighbour = s;
        bestCand = cj;
      }
    }
    // Меняем только при явном перевесе «это текст соседа».
    if (bestNeighbour > sim(me.msgstr, candSelf) + 0.05) {
      me.msgstr = candSelf;
      changed++;
    } else {
      kept++;
      void bestCand;
    }
  }
  console.log(`${LANG}: заменено ${changed}, оставлено как верные ${kept}`);
  if (!APPLY) {
    console.log("применить: --apply --flagged <файл>");
    process.exit(0);
  }
  writeFileSync(`tmp/${LANG}.po.flagged-backup`, text, "utf-8");
  writePoAtomic(PO, renderPo(entries.filter((e) => e.msgid), text.split("\n\n")[0]!.split("\n")));
  process.exit(0);
}

/**
 * Режим --pairs: чинит пары, где две соседние строки имеют ОДИН И ТОТ ЖЕ перевод
 * (одна из них держит чужой текст). Обе переводятся заново, каждой ставится её
 * собственный перевод. Нужно после парной починки пустых: у непустой строки
 * чужой текст иначе остаётся навсегда (замечено на fr: 141 флаг ревью).
 */
if (args.includes("--pairs")) {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i]!;
    const b = rows[i + 1]!;
    if (!a.msgstr.trim() || !b.msgstr.trim()) continue;
    if (sim(a.msgid, b.msgid) >= 0.7) continue; // один оригинал — совпадение законно
    const same =
      a.msgstr.trim() === b.msgstr.trim() ||
      (a.msgstr.length >= 20 && b.msgstr.includes(a.msgstr.trim())) ||
      (b.msgstr.length >= 20 && a.msgstr.includes(b.msgstr.trim()));
    if (same) pairs.push([i, i + 1]);
  }
  const workPairs = LIMIT ? pairs.slice(0, LIMIT) : pairs;
  console.log(
    `${LANG}: пар с одинаковым переводом ${pairs.length}, к разбору ${workPairs.length}${APPLY ? "" : " (dry-run)"}`,
  );
  let done = 0;
  let failedPairs = 0;
  for (const [i, j] of workPairs) {
    const a = rows[i]!;
    const b = rows[j]!;
    const ca = await translate(a.msgid);
    const cb = await translate(b.msgid);
    const ok = (c: string) => c && !/\b(the|and|you|she|her|his|that|was|for|not|with|have|would|could)\b/i.test(c);
    if (!ok(ca) || !ok(cb) || sim(ca, cb) > 0.95) {
      failedPairs++;
      console.log(`  сбой пары #${i}/#${j}`);
      continue;
    }
    a.msgstr = ca;
    b.msgstr = cb;
    done++;
  }
  console.log(`${LANG}: пар исправлено ${done}, сбоев ${failedPairs}`);
  if (!APPLY) {
    console.log("применить: --apply --pairs");
    process.exit(0);
  }
  writeFileSync(`tmp/${LANG}.po.pairs-backup`, text, "utf-8");
  writePoAtomic(PO, renderPo(entries.filter((e) => e.msgid), text.split("\n\n")[0]!.split("\n")));
  const after = parsePo(readFileSync(PO, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);
  console.log(`${LANG}: пустых теперь ${after.filter((e) => !e.msgstr.trim()).length}`);
  process.exit(0);
}
const empties: number[] = [];
rows.forEach((e, i) => {
  if (!e.msgstr.trim()) empties.push(i);
});
const work = LIMIT ? empties.slice(0, LIMIT) : empties;
console.log(`${LANG}: пустых ${empties.length}, к парному разбору ${work.length}${APPLY ? "" : " (dry-run)"}`);

let fixed = 0;
let movedNeighbour = 0;
let failed = 0;
for (const i of work) {
  const me = rows[i]!;
  const j = [i - 1, i + 1].find((k) => {
    const n = rows[k];
    return n && n.msgstr.trim() && sim(me.msgid, n.msgid) < 0.7;
  });
  if (j === undefined) continue;
  const nb = rows[j]!;
  const candI = await translate(me.msgid);
  if (!candI || /\b(the|and|you|she|her|his|that|was|for|not|with|have|would|could)\b/i.test(candI)) {
    failed++;
    console.log(`  сбой #${i}: модель вернула пусто/английский`);
    continue;
  }
  const candJ = await translate(nb.msgid);
  const closerToMe = sim(nb.msgstr, candI) > sim(nb.msgstr, candJ) + 0.05;
  if (closerToMe) {
    // Сосед держал НАШУ строку: забираем, соседу отдаём его собственный перевод.
    me.msgstr = candI;
    if (candJ) nb.msgstr = candJ;
    movedNeighbour++;
    console.log(`  #${i} ← из соседа #${j}; соседу возвращён его перевод`);
  } else {
    me.msgstr = candI;
  }
  fixed++;
}

console.log(`${LANG}: заполнено ${fixed} (из них с переносом от соседа ${movedNeighbour}), сбоев ${failed}`);
if (!APPLY) {
  console.log("применить: --apply");
  process.exit(0);
}
writeFileSync(`tmp/${LANG}.po.pairfix-backup`, text, "utf-8");
writePoAtomic(PO, renderPo(entries.filter((e) => e.msgid), text.split("\n\n")[0]!.split("\n")));
const after = parsePo(readFileSync(PO, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);
console.log(`${LANG}: пустых теперь ${after.filter((e) => !e.msgstr.trim()).length}`);
