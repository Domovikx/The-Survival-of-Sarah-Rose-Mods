/**
 * translate_unglue.mts — разклейка po: обнуляет строки, которые содержат перевод
 * СОСЕДА (модель при генерации «дописывала» следующую реплику).
 *
 * Зачем отдельный шаг: гейт в `translate_run`/`translate_salvage` сравнивает
 * кандидата с ПЕРЕВОДАМИ соседей, и если сосед испорчен (хранит чужой текст),
 * правильный перевод строки отклоняется как «перевод соседа». Круг замкнут:
 * испорченный сосед не даёт починить соседа испорченного. Проверено 2026-11-18
 * на `fr`: спасение дало 27 из 241, остальные 214 — ложные «перевод соседа».
 *
 * Решение: сначала обнулить подозрительные (они станут «пустыми»), затем
 * `translate_salvage <lang> --apply` заполнит их 1:1 без конфликтов.
 *
 * Запуск:
 *   node .opencode/skills/translate/translate_unglue.mts fr          # план
 *   node .opencode/skills/translate/translate_unglue.mts fr --apply # обнулить
 *   ... --min-words 6   # порог «вклейки» (по умолчанию 6 слов, как у review)
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
  if (tb.length >= 20 && ta.includes(tb)) return `вклейка #${j}`;
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
writePoAtomic(PO, renderPo(entries, header));
const after = parsePo(readFileSync(PO, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);
console.log(
  `${LANG}: обнулено ${cleared.length}, пустых теперь ${after.filter((e) => !e.msgstr.trim()).length}. ` +
    `Дальше: node .opencode/skills/translate/translate_salvage.mts ${LANG} --apply`,
);
