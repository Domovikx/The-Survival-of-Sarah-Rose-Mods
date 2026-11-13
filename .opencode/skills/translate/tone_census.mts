/**
 * tone_census.mts — чем КОРПУС уже переводит телесную лексику (словарь книги).
 *
 * Зачем: правка регистра должна попадать в сложившийся словарь перевода, а не
 * придумывать свой. Если книга на 58 строках говорит «киска» для pussy, замена
 * на «пизда» — дефект, даже когда английский грубый. Перед прогоном
 * tone_fix.mts по языку снимаем эту перепись и подкладываем её в подсказку.
 *
 * Как считаем: берём строки, где в msgid есть EN-термин, и ищем слова,
 * ХАРАКТЕРНЫЕ именно для них — частота в подмножестве против частоты во всём
 * корпусе (TF-IDF по-простому). Топ-слова без такой нормировки — это «и», «в»,
 * «её»: они есть везде и ничего не говорят о переводе термина.
 *
 *   node .opencode/skills/translate/tone_census.mts --lang ru
 *   node .opencode/skills/translate/tone_census.mts --lang de --terms "pussy,cock,sex"
 *
 * Детерминированно, без модели и без записи файлов (только stdout).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parsePo } from "../renpy-po/po_core.mts";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const LANG = arg("--lang") ?? "ru";
const TERMS = (arg("--terms") ?? "pussy,cock,cunt,ass,her sex,clit")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

/** EN-термин → регэксп с границами слова (кроме многословных, там пробел сам граница). */
const termRe = (term: string): RegExp => {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![\\p{L}])${esc}(?:s|es)?(?![\\p{L}])`, "giu");
};

/**
 * Токенизация по языку: у иероглифических языков слова не разделены пробелами,
 * поэтому там единица — символ (отдельные иероглифы наравне с устойчивыми
 * парами, которые всё равно видны как частые символы).
 */
const CJK = new Set(["ja", "ko", "zh"]);
const tokens = (s: string, lang: string): string[] => {
  const clean = s.replace(/\{[^}]*\}|\[[^\]]*\]/gu, " ");
  if (CJK.has(lang)) return [...clean].filter((c) => /\p{L}/u.test(c));
  return (clean.toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu) ?? []).filter((w) => w.length >= 3);
};

const text = readFileSync(join("patches", "ai-voice-pack", "po", `${LANG}.po`), "utf-8").replace(/\r\n/gu, "\n");
const entries = parsePo(text).filter((e) => e.msgid && e.msgstr);

// Частоты по всему корпусу — база для нормировки.
const overall = new Map<string, number>();
for (const e of entries) for (const t of tokens(e.msgstr, LANG)) overall.set(t, (overall.get(t) ?? 0) + 1);

console.log(`tone_census: ${LANG} | строк ${entries.length}`);

for (const term of TERMS) {
  const re = termRe(term);
  const hits = entries.filter((e) => re.test(e.msgid));
  if (!hits.length) {
    console.log(`\n${term}: строк 0`);
    continue;
  }
  const inSubset = new Map<string, number>();
  for (const e of hits) for (const t of tokens(e.msgstr, LANG)) inSubset.set(t, (inSubset.get(t) ?? 0) + 1);

  // Характерность: доля в подмножестве / доля в корпусе. Порог 3 отсекает
  // случайные совпадения, сортировка — по силе связи, потом по частоте.
  const ranked = [...inSubset]
    .filter(([, n]) => n >= 3)
    .map(([w, n]) => ({ w, n, lift: n / hits.length / ((overall.get(w) ?? 1) / entries.length) }))
    .toSorted((a, b) => b.lift - a.lift || b.n - a.n)
    .slice(0, 12);

  const sep = CJK.has(LANG) ? "" : " ";
  console.log(`\n${term}: строк ${hits.length}`);
  console.log(
    "  " +
      ranked
        .filter((r) => r.lift >= 1.5)
        .map((r) => `${r.w}${sep}(${r.n})`)
        .join("  ") || "  — nichts Charakteristisches",
  );
}
