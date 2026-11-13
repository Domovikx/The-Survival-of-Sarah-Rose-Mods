/**
 * tone_fix.mts — подъём регистра 18+ в ГОТОВЫХ переводах po/<lang>.po.
 *
 * Проблема (владелец, 2026-11-13): локальный переводчик местами выдаёт
 * медицинский/канцелярский язык вместо художественной прозы —
 * «а половые органы оставались открытыми» вместо «а лоно оставалось открытым».
 *
 * Как лечим (не переперевод, а минимальная правка):
 *   1) детерминированный детектор клинических лексем (tone_lexicon.mts)
 *      находит строки-кандидаты — без модели, дёшево и воспроизводимо;
 *   2) модель получает EN-оригинал, текущий перевод и найденный ТЕРМИН и
 *      возвращает только {fragment, replacement} — фрагмент, который надо
 *      заменить. Вклейку делает код, поэтому остальная строка физически не
 *      может пострадать (иначе модель «заодно» переписывает полстроки и теряет
 *      имена — проверено 2026-11-13);
 *   3) механические гейты (клиника ушла? имена/теги/пунктуация целы?);
 *   4) судья LLM проверяет смысл, грамматику и регистр; брак возвращается
 *      модели с замечанием — до 4 попыток с растущей температурой;
 *   5) не принятое — остаётся как было и попадает в отчёт для человека.
 *
 * Запуск (dry-run по умолчанию, po НЕ трогается):
 *   node .opencode/skills/translate/tone_fix.mts --lang ru
 *   node .opencode/skills/translate/tone_fix.mts --lang ru --limit 20
 *   node .opencode/skills/translate/tone_fix.mts --lang ru --only 9300,30100 --repeat 3
 *   node .opencode/skills/translate/tone_fix.mts --lang ru --apply
 *
 * Отчёт: tmp/tone_<lang>.json (машинный) + tmp/tone_<lang>.log (глазами).
 * --repeat N — прогнать одну и ту же строку N раз и показать разброс (E2E).
 */

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolveBackend } from "../../../scripts/llm_backend.mts";
import { parsePo, renderPo, writePoAtomic } from "../renpy-po/po_core.mts";
import { checkEdit, findTerms, isDefective, LEXICON_LANGS, nextDefect, registerMismatch } from "./tone_lexicon.mts";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string): boolean => process.argv.includes(name);

const LANG = arg("--lang") ?? "ru";
if (!LEXICON_LANGS.includes(LANG)) {
  console.error(`нет лексикона для «${LANG}» (есть: ${LEXICON_LANGS.join(", ")})`);
  process.exit(2);
}
const APPLY = flag("--apply");
const LIMIT = Number(arg("--limit") ?? 0) || 0;
const ONLY = (arg("--only") ?? "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean)
  .map(Number)
  .filter(Number.isFinite);
const REPEAT = Math.max(1, Number(arg("--repeat") ?? 1) || 1);
const CONC = Math.max(1, Number(arg("--concurrency") ?? 3) || 3);
const MAX_TRIES = Math.max(1, Number(arg("--tries") ?? 4) || 4);
const VOTES = Math.max(1, Number(arg("--votes") ?? 1) || 1);
const OUT_JSON = arg("--report") ?? join("tmp", `tone_${LANG}.json`);
const OUT_LOG = arg("--log") ?? join("tmp", `tone_${LANG}.log`);

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
const TARGET_LANG = TARGET[LANG] ?? LANG;

/**
 * Языковая подсказка о РЕГИСТРЕ. Это ориентир для модели, а не таблица замен:
 * текст пишет она сама и на каждой строке свой (владелец, 2026-11-13:
 * «перевод копипастом делать нельзя, это творческий процесс»).
 */
const REGISTER_HINT: Record<string, string> = {
  ru: `Russian prose of this genre stays plain and physical. This book already has its own vocabulary: "киска" for pussy/cunt, "член" for cock, "задница" for ass, "ягодицы" for a gentle "behind"/"rear"/"butt"/"cheeks", and for "her sex" it says where it is or what it is ("между ног", "её плоть", "внутрь") instead of a medical phrase. Keep the level of the English: a blunt word stays blunt, a gentle word stays gentle, do not flatten one into the other. Childish forms ("попка", "пиписька") are not used at all. Keep the book's vocabulary, find your own wording for each line. This book never says «пизда», «манда» or «хуй», not even where the English is crude: its blunt words are «киска», «член», «задница». Archaic and bookish words are always wrong here: "ложе", "нега", "лощина", "нутро", "естество", "чресла"; "лоно" is a last resort.`,
  de: `German prose of this genre stays concrete and plain: an everyday word or a phrase that points at the place, not a latinate term and not stilted nominal style. Keep the level of the English: a blunt word stays blunt, a gentle one (bottom, behind, cheeks) stays gentle, and childish or diminutive forms are wrong unless the English is itself childish. Vary the wording from line to line.`,
  es: `Spanish prose of this genre stays plain and physical: an everyday word or a phrase that points at the place, not a clinical Latinism. Keep the level of the English: a blunt word stays blunt, a gentle one (bottom, behind, cheeks) stays gentle, and childish or diminutive forms are wrong unless the English is itself childish. Vary the wording from line to line.`,
  fr: `French prose of this genre stays plain and physical: an everyday word or a phrase that points at the place, not a clinical Latinism. Keep the level of the English: a blunt word stays blunt, a gentle one (bottom, behind, cheeks) stays gentle, and childish or diminutive forms are wrong unless the English is itself childish. Vary the wording from line to line.`,
  it: `Italian prose of this genre stays plain and physical: an everyday word or a phrase that points at the place, not a clinical Latinism. Keep the level of the English: a blunt word stays blunt, a gentle one (bottom, behind, cheeks) stays gentle, and childish or diminutive forms are wrong unless the English is itself childish. Vary the wording from line to line.`,
  pl: `Polish prose of this genre stays plain and physical: an everyday word or a phrase that points at the place, not a medical Latinism. Keep the level of the English: a blunt word stays blunt, a gentle one (bottom, behind, cheeks) stays gentle, and childish or diminutive forms are wrong unless the English is itself childish. Vary the wording from line to line.`,
  pt: `Portuguese prose of this genre stays plain and physical: an everyday word or a phrase that points at the place, not a clinical Latinism. Keep the level of the English: a blunt word stays blunt, a gentle one (bottom, behind, cheeks) stays gentle, and childish or diminutive forms are wrong unless the English is itself childish. Vary the wording from line to line.`,
  ja: `Japanese prose of this genre uses everyday words or points at the place, not medical kanji compounds. Keep the level of the English: a blunt word stays blunt, a gentle one (bottom, behind, cheeks) stays gentle, and childish or diminutive forms are wrong unless the English is itself childish. Vary the wording from line to line.`,
  ko: `Korean prose of this genre uses everyday words or points at the place, not medical Sino-Korean terms. Keep the level of the English: a blunt word stays blunt, a gentle one (bottom, behind, cheeks) stays gentle, and childish or diminutive forms are wrong unless the English is itself childish. Vary the wording from line to line.`,
  zh: `Chinese prose of this genre uses everyday words or points at the place, not medical compounds. Keep the level of the English: a blunt word stays blunt, a gentle one (bottom, behind, cheeks) stays gentle, and childish or diminutive forms are wrong unless the English is itself childish. Vary the wording from line to line.`,
};

const EDITOR_SYS = `You are a literary editor of 18+ prose in ${TARGET_LANG}. You get one SOURCE line (English), its TRANSLATION (${TARGET_LANG}) and TERM (a clinical/medical word inside the translation).

Return JSON only: {"fragment": "...", "replacement": "..."}

- "fragment" is an EXACT substring of the translation, copied character for character. It must cover TERM and every other word that has to change with it to stay grammatical (verb, adjective, participle, pronoun, possessive name). Nothing beyond that.
- "replacement" rewrites exactly that span as prose. Same meaning, same grammatical role, and the result must agree with everything left outside the span.
- Everything outside the span is left untouched: do not repeat it, do not fix anything else in it.

${REGISTER_HINT[LANG] ?? ""}

Register comes from the ENGLISH source, not from the existing translation: a neutral/literary euphemism in English ("her sex", "between her legs") stays neutral/literary; a crude English word ("pussy", "cock", "ass") stays equally crude. Never more explicit and never more modest than the source.

Hard rules:
- everyday modern ${TARGET_LANG} only — the words a novelist actually uses, no archaic, bookish, poetic or invented words;
- the replacement must not be another medical or anatomical term;
- do not add a possessive pronoun if the sentence already names the owner;
- never drop a character name: if the span contains a name, the replacement keeps it;
- if the new word has another gender or number than the old one, the fragment MUST also include every word outside that agrees with it (verb, adjective, participle) — otherwise the sentence breaks;
- if the word right before TERM is a preposition, article or contraction that only fits the old word, the fragment MUST start with that word and rewrite it too, so no orphaned preposition is left in front of the new wording;
- no added images, metaphors, details or sensations; do not change which body part is meant;
- the replacement may not be longer than the fragment by more than two words.

Example of the shape of the answer: {"fragment": "к промежности Кейт", "replacement": "между ног Кейт"}

Find your own wording for every line: the same stock phrase repeated all over the book reads worse than the medical word it replaced.`;

const judgeSys = (
  terms: string[],
): string => `You check ONE edit of an 18+ literary translation into ${TARGET_LANG}. You get SOURCE (en), OLD (current ${TARGET_LANG} line), REPLACED (which span was swapped: fragment -> replacement) and NEW (the line after that swap).

Your single job: decide whether NEW is a valid literary replacement for OLD.

Answer JSON only: {"ok": true|false, "reason": "<short, English>"}

Read NEW as a whole and check grammar carefully, especially the words that stay right next to the replaced span: if the new wording has another gender, number or case, those words must still agree with it. "её плоть — обнажено" is broken and must be rejected.

Reject (ok=false) only if:
- NEW is grammatically broken or unreadable (agreement, case, verb form, word order);
- NEW still contains a clinical/anatomical term (${terms.join(", ")});
- NEW contains an unnatural, archaic, poetic or invented word for this context;
- NEW names the owner twice (possessive pronoun plus the name) or lost a character name;
- NEW sits further from SOURCE in register than OLD: a softened, childish or diminutive word where SOURCE is blunt is as wrong as a medical term ("сучка" for "bitch", "попка" for "ass"), and a crude word where SOURCE is mild is also wrong;
- the meaning or the body part changed, or a detail appeared that SOURCE does not have.

Do NOT judge elegance, do NOT ask for more anatomical precision, and do NOT defend the old medical wording: removing it is the whole point. A natural everyday euphemism is the correct answer even if it names the organ less precisely.

For Japanese, Korean and Chinese note that a plain everyday word is right even when it is vaguer than the medical term.`;

const backend = resolveBackend();

const chat = async (system: string, user: string, temp: number, maxTokens = 150): Promise<string> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${backend.url.replace(/\/$/u, "")}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: backend.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: temp,
          max_tokens: maxTokens,
          stream: false,
          reasoning_effort: "none",
        }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return d.choices?.[0]?.message?.content ?? "";
    } catch (e) {
      if (attempt === 1) throw e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return "";
};

const parseJson = <T,>(raw: string): T | null => {
  const m = /\{[\s\S]*\}/u.exec(raw);
  if (!m) return null;
  try {
    return JSON.parse(m[0].replace(/,\s*([}\]])/gu, "$1")) as T;
  } catch {
    return null;
  }
};

interface Edit {
  fragment?: string;
  replacement?: string;
}
interface Verdict {
  ok?: boolean;
  reason?: string;
}

/** Одна правка: редактор → гейты → судья, с возвратом замечаний модели. */
interface Proposal {
  fragment: string;
  replacement: string;
  line: string;
  rejected?: string;
}
async function fixOnce(
  en: string,
  line: string,
  lang: string,
): Promise<{ out: string; notes: string[]; proposals: Proposal[] }> {
  const terms = [...findTerms(line, lang).strong, ...registerMismatch(line, en, lang)];
  let feedback = "";
  const notes: string[] = [];
  const proposals: Proposal[] = [];
  let current = line;
  for (let round = 0; round < 3; round++) {
    const defect = nextDefect(current, en, lang);
    if (!defect) break;
    const term = defect.term;
    const why = defect.why;
    let accepted: string | null = null;
    for (let attempt = 0; attempt < MAX_TRIES && accepted === null; attempt++) {
      const temp = [0, 0.3, 0.55, 0.75, 0.85][attempt] ?? 0.85;
      const e = parseJson<Edit>(
        await chat(
          EDITOR_SYS,
          `SOURCE (en): ${en}\nTRANSLATION (${lang}): ${current}\nTERM (exact text as it stands in the translation, keep it character for character inside the fragment): ${term}
WHY IT IS WRONG: ${why}${feedback}`,
          temp,
        ),
      );
      if (!e?.fragment || !e?.replacement) {
        notes.push(`#${attempt + 1} нет JSON`);
        continue;
      }
      const at = current.indexOf(e.fragment);
      if (at < 0 || current.indexOf(e.fragment, at + 1) >= 0) {
        notes.push(`#${attempt + 1} фрагмент не найден однозначно`);
        proposals.push({
          fragment: e.fragment,
          replacement: e.replacement,
          line: current,
          rejected: "фрагмент не найден",
        });
        feedback =
          "\n\nIMPORTANT: the previous fragment was not an exact, unique substring. Copy it character for character.";
        continue;
      }
      const cand = current.slice(0, at) + e.replacement + current.slice(at + e.fragment.length);
      const gate = checkEdit(current, cand, lang);
      if (gate.length) {
        notes.push(`#${attempt + 1} гейт: ${gate.join("; ")}`);
        proposals.push({ fragment: e.fragment, replacement: e.replacement, line: cand, rejected: gate.join("; ") });
        const lost = /потеряно имя: (.+)$/u.exec(gate.join("; "))?.[1];
        feedback =
          `\n\nIMPORTANT: the previous attempt broke a hard rule: ${gate.join("; ")}. Fix exactly that.` +
          (lost ? ` The name(s) ${lost} must stay in the line: put them inside the replacement.` : "");
        continue;
      }
      const verdicts: Verdict[] = [];
      const replaced = `"${e.fragment}" -> "${e.replacement}"`;
      for (let v = 0; v < VOTES; v++) {
        const j = parseJson<Verdict>(
          await chat(
            judgeSys(terms),
            `SOURCE (en): ${en}\nOLD (${lang}): ${current}\nREPLACED: ${replaced}\nNEW (${lang}): ${cand}`,
            v === 0 ? 0 : 0.4,
            100,
          ),
        );
        if (j?.ok === undefined) continue;
        verdicts.push(j);
      }
      const no = verdicts.filter((v) => v.ok === false);
      if (no.length && no.length * 2 >= verdicts.length) {
        notes.push(`#${attempt + 1} брак: ${no[0].reason ?? "без причины"}`);
        proposals.push({ fragment: e.fragment, replacement: e.replacement, line: cand, rejected: no[0].reason ?? "" });
        feedback = `\n\nYour previous attempt replaced ${replaced} and was rejected by the editor-in-chief: "${no[0].reason ?? ""}". Fix exactly that problem. If the rejection is about agreement, extend the fragment so that the words which agree with the new one are inside it too.`;
        continue;
      }
      accepted = cand;
      notes.push(`#${attempt + 1} ok [${e.fragment} → ${e.replacement}]`);
    }
    if (accepted === null) break;
    current = accepted;
  }
  return { out: current, notes, proposals };
}

interface Row {
  idx: number;
  ctxt: string;
  en: string;
  old: string;
  runs: string[];
  notes: string[];
  accepted: boolean;
  proposals: Proposal[];
}

const text = readFileSync(join("patches", "ai-voice-pack", "po", `${LANG}.po`), "utf-8").replace(/\r\n/gu, "\n");
const entries = parsePo(text).filter((e) => e.msgid);
const header = text.split("\n\n")[0].split("\n");

// --from <report.json>: применить уже выверенный отчёт dry-run, НЕ вызывая модель.
// Ровно тот сценарий, ради которого отчёт и пишется: прогон на 208 строк стоит
// часы, а применение — секунды, заново спрашивать модель нельзя (другие формулировки).
// Защита: строка в po обязана совпадать с `old` из отчёта; если её успели
// поправить руками — пропускаем, а не правим «примерно туда».
const FROM = arg("--from");
if (FROM) {
  const rep = JSON.parse(readFileSync(FROM, "utf-8")) as { rows: Row[] };
  const accepted = rep.rows.filter((r) => r.accepted);
  const applied: number[] = [];
  const skipped: string[] = [];
  for (const r of accepted) {
    const e = entries[r.idx];
    const out = r.runs[0];
    if (!e) {
      skipped.push(`idx ${r.idx}: нет такой строки`);
      continue;
    }
    if (e.msgstr !== r.old) {
      skipped.push(`idx ${r.idx}: строка в po изменилась с момента отчёта`);
      continue;
    }
    if (!out || out === r.old) continue;
    if (isDefective(out, r.en, LANG)) {
      skipped.push(`idx ${r.idx}: правка не проходит детектор`);
      continue;
    }
    e.msgstr = out;
    applied.push(r.idx);
  }
  writePoAtomic(join("patches", "ai-voice-pack", "po", `${LANG}.po`), renderPo(entries, header));
  const listPath = join("tmp", `tone_${LANG}_applied.txt`);
  writeFileSync(listPath, `${applied.join("\n")}\n`, "utf-8");
  console.log(`применено ${applied.length} из ${accepted.length} правок отчёта ${FROM}`);
  console.log(`список индексов для перепроверки — ${listPath}`);
  if (skipped.length) console.log(`пропущено ${skipped.length}:\n  ${skipped.join("\n  ")}`);
  process.exit(0);
}

const candidates = entries
  .map((e, idx) => ({ e, idx }))
  .filter(({ e }) => e.msgstr && isDefective(e.msgstr, e.msgid, LANG));
const selected = candidates.filter(({ idx }) => !ONLY.length || ONLY.includes(idx));
const work = LIMIT ? selected.slice(0, LIMIT) : selected;

console.log(
  `tone_fix: ${LANG} | записей ${entries.length} | кандидатов ${candidates.length} | в работе ${work.length}` +
    ` | режим ${APPLY ? "APPLY (po перезаписывается)" : "dry-run"} | попыток ${MAX_TRIES} | голосов судьи ${VOTES}` +
    (REPEAT > 1 ? ` | repeat ${REPEAT}` : ""),
);

// --detect: только посчитать кандидатов и показать примеры — без модели.
// Нужно, чтобы оценить объём работы по языку до запуска LLM.
if (flag("--detect")) {
  const per = new Map<string, number>();
  for (const { e } of candidates)
    for (const t of [...findTerms(e.msgstr, LANG).strong, ...registerMismatch(e.msgstr, e.msgid, LANG)])
      per.set(t, (per.get(t) ?? 0) + 1);
  console.log(`\n кандидатов ${candidates.length} (${((candidates.length / entries.length) * 100).toFixed(2)}%)`);
  for (const [t, n] of [...per].toSorted((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(5)}  ${t}`);
  for (const { idx, e } of candidates.slice(0, 5)) console.log(`\n  [${idx}] ${e.msgstr.slice(0, 160)}`);
  process.exit(0);
}
writeFileSync(OUT_LOG, "", "utf-8");

const rows: Row[] = [];
let cursor = 0;
let done = 0;

const lane = async (): Promise<void> => {
  for (;;) {
    const i = cursor++;
    if (i >= work.length) return;
    const { e, idx } = work[i];
    const runs: string[] = [];
    const notes: string[] = [];
    const proposals: Proposal[] = [];
    for (let rep = 0; rep < REPEAT; rep++) {
      const { out, notes: n, proposals: p } = await fixOnce(e.msgid, e.msgstr, LANG);
      runs.push(out);
      if (rep === 0) {
        notes.push(...n);
        proposals.push(...p);
      } else if (out !== runs[0]) notes.push(`repeat#${rep + 1} иначе: ${out}`);
    }
    const out = runs[0] ?? e.msgstr;
    const accepted = out !== e.msgstr && !isDefective(out, e.msgid, LANG);
    rows.push({ idx, ctxt: e.msgctxt, en: e.msgid, old: e.msgstr, runs, notes, accepted, proposals });
    if (APPLY && accepted) entries[idx].msgstr = out;
    const mark = accepted ? "✓" : "✗";
    appendFileSync(
      OUT_LOG,
      `### [${++done}/${work.length}] idx ${idx} ${mark} ${e.msgctxt}\n  EN: ${e.msgid}\n  было: ${e.msgstr}\n  стало: ${out}\n  ${notes.join(" ; ")}\n\n`,
      "utf-8",
    );
    console.log(`[${done}/${work.length}] idx ${idx} ${mark} ${notes.at(-1) ?? ""}`);
  }
};

await Promise.all(Array.from({ length: CONC }, () => lane()));

const acceptedRows = rows.filter((r) => r.accepted);
writeFileSync(
  OUT_JSON,
  `${JSON.stringify(
    {
      lang: LANG,
      backend: backend.name,
      model: backend.model,
      applied: APPLY,
      total: work.length,
      accepted: acceptedRows.length,
      rejected: rows.length - acceptedRows.length,
      rows: rows.toSorted((a, b) => a.idx - b.idx),
    },
    null,
    2,
  )}\n`,
  "utf-8",
);

if (APPLY && acceptedRows.length) {
  writePoAtomic(join("patches", "ai-voice-pack", "po", `${LANG}.po`), renderPo(entries, header));
}

const distinct = (r: Row): number => new Set(r.runs).size;
const unstable = rows.filter((r) => distinct(r) > 1);
console.log(
  `\nитог: принято ${acceptedRows.length} / осталось ${rows.length - acceptedRows.length}` +
    ` | правки в ${APPLY ? "po записаны" : "po НЕ вносились (dry-run)"}` +
    ` | отчёт ${OUT_JSON}, лог ${OUT_LOG}`,
);
if (REPEAT > 1) {
  console.log(`стабильность (repeat ${REPEAT}): строк с разными результатами ${unstable.length}/${rows.length}`);
  for (const r of unstable)
    console.log(`  idx ${r.idx}: ${r.runs.length} вариантов — ${[...new Set(r.runs)].join(" ◆ ")}`);
}
