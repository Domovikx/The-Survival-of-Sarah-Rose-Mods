/**
 * translate_unglue.mts — подготовка po к повторному переводу: сброс строк,
 * содержащих перевод соседней строки.
 *
 * Проблема. Контроль качества в `translate_run` и `translate_salvage` сравнивает
 * кандидата с переводами соседних строк. Если соседняя строка уже содержит текст
 * данной строки (последствие склейки при генерации), корректный перевод
 * отклоняется как «перевод соседа», и строка не исправляется ни при каком числе
 * повторов.
 *
 * Решение. Строки, подозрительные на склейку, обнуляются; последующий вызов
 * `translate_salvage <lang> --apply` переводит их заново по одной, вне контекста
 * соседей. Наблюдение 2026-11-18 (`fr`): из 241 строки прямое спасение
 * обработало 27, остальные 214 упирались в этот эффект.
 *
 * Критерии подозрительности: точное совпадение перевода с соседним либо
 * вхождение перевода соседа в строку (от 10 символов или от 3 слов). Пары с
 * одинаковыми оригиналами не рассматриваются — совпадение перевода там законно.
 *
 * Запуск:
 *   node .opencode/skills/translate/translate_unglue.mts fr          # отчёт
 *   node .opencode/skills/translate/translate_unglue.mts fr --apply # обнулить
 *   ... --min-words 6   # порог склейки, по умолчанию как в translate_review
 */
import { readFileSync, writeFileSync } from "node:fs";

import { parsePo, renderPo, writePoAtomic } from "../renpy-po/po_core.mts";
import { sharePhrase } from "./review_common_run.mts";

const args = process.argv.slice(2);
const LANG = args[0] ?? "fr";
const APPLY = args.includes("--apply");
const wordsAt = args.indexOf("--min-words");
const MIN_WORDS = wordsAt >= 0 ? Number(args[wordsAt + 1]) : 6;
// Путь переопределяем ради E2E-теста (тот же код на синтетическом po).
const PO = process.env.TSSR_SALVAGE_PO ?? `patches/ai-voice-pack/po/${LANG}.po`;

const text = readFileSync(PO, "utf-8").replace(/\r\n/g, "\n");
const entries = parsePo(text);
const rows = entries.filter((e) => e.msgid);

/** Содержит ли `tr` перевод соседа (точное совпадение или вклейка). */
const gluedWith = (i: number, j: number): string | null => {
  const a = rows[i];
  const b = rows[j];
  if (!a?.msgstr.trim() || !b?.msgstr.trim()) return null;
  if (sharePhrase(a.msgid, b.msgid)) return null; // один оригинал — совпадение законно
  const ta = a.msgstr.trim();
  const tb = b.msgstr.trim();
  if (ta === tb) return `дубль #${j}`;
  // Порог «20 символов» пропускал короткие вклейки («Oui. Bien sûr.» содержит
  // «Oui.» — 4 символа). Считаем по СЛОВАМ: 3+ слова соседа внутри нашей строки.
  if ((tb.length >= 10 || tb.split(" ").filter(Boolean).length >= 3) && ta.includes(tb)) return `вклейка #${j}`;
  const wa = ta.split(" ");
  const wb = tb.split(" ");
  // Общий кусок ≥ MIN_WORDS подряд — второй тип вклейки (частичное дописывание).
  const set = new Set(
    wb.map((w, k) => wb.slice(k, k + MIN_WORDS).join(" ")).filter((s) => s.split(" ").length === MIN_WORDS),
  );
  for (let k = 0; k + MIN_WORDS <= wa.length; k++) {
    const chunk = wa.slice(k, k + MIN_WORDS).join(" ");
    if (set.has(chunk)) return `вклейка части #${j}`;
  }
  return null;
};

const cleared: Array<{ i: number; why: string; en: string }> = [];
for (let i = 0; i < rows.length; i++) {
  for (const j of [i - 1, i + 1]) {
    if (j < 0 || j >= rows.length) continue;
    const why = gluedWith(i, j);
    if (!why) continue;
    // Взаимный дубль: оба перевода одинаковы. Раньше такие оставляли как
    // «вероятно законные», но именно они и блокируют починку: сосед с тем же
    // текстом → гейт отклоняет правильный перевод как «перевод соседа»
    // (проверено 2026-11-18 на fr: 214 отказов). Обнуляем ОБА — модель переведёт
    // каждую строку по её оригиналу; если совпадение было законным, оно и
    // получится снова.
    cleared.push({ i, why, en: rows[i]!.msgid });
    break;
  }
}

console.log(`${LANG}: обнулить ${cleared.length} из ${rows.length}`);
for (const c of cleared.slice(0, 8)) console.log(`  #${c.i} (${c.why}): ${c.en.slice(0, 70)}`);
if (cleared.length > 8) console.log(`  … и ещё ${cleared.length - 8}`);

if (!APPLY) {
  console.log("применить: --apply (обнулит эти строки, дальше translate_salvage --apply)");
  process.exit(0);
}

// Резерв: любая массовая правка po — только с копией.
writeFileSync(`tmp/${LANG}.po.unglue-backup`, text, "utf-8");
const header = text.split("\n\n")[0]!.split("\n");
let idx = 0;
for (const e of entries) {
  if (!e.msgid) continue;
  const hit = cleared.find((c) => c.i === idx);
  if (hit) e.msgstr = "";
  idx++;
}
writePoAtomic(
  PO,
  renderPo(
    entries.filter((e) => e.msgid),
    header,
  ),
);
const after = parsePo(readFileSync(PO, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);
console.log(
  `${LANG}: обнулено ${cleared.length}, пустых теперь ${after.filter((e) => !e.msgstr.trim()).length}. ` +
    `Дальше: node .opencode/skills/translate/translate_salvage.mts ${LANG} --apply`,
);
