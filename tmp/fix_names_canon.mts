/**
 * Разовый ремонт: унификация написаний имён к канону speaker-name
 * (меньшинство → канон; частоты проверены глазами 2026-11-06) + единичные
 * правки вин. падежа. Запуск: node tmp/fix_names_canon.mts
 */
import { readFileSync } from "node:fs";

import { parsePo, renderPo, writePoAtomic } from "../.opencode/skills/renpy-po/po_core.mts";

const PO = "patches/ai-voice-pack/po/ru.po";
const text = readFileSync(PO, "utf-8").replace(/\r\n/g, "\n");
const entries = parsePo(text).filter((e) => e.msgid);
const header = text.split("\n\n")[0].split("\n");

const pairs: Array<[string, string]> = [
  ["Белмонт", "Бельмонт"],
  ["Сигмунд", "Зигмунд"],
  ["Кэролин", "Каролин"],
  ["Рэмзи", "Рамзи"],
  ["Вэлен", "Ваэлен"],
  ["Гилэд", "Гилеад"],
  ["Никлас", "Николас"],
  ["Джасмин", "Джазмин"],
  ["Орвен", "Оруэн"],
];

let n = 0;
for (const e of entries) {
  if (!e.msgstr) continue;
  let t = e.msgstr;
  for (const [bad, good] of pairs) if (t.includes(bad)) t = t.split(bad).join(good);
  if (t !== e.msgstr) {
    e.msgstr = t;
    n++;
  }
}
// единичное: [13279] вин. падеж от канон «Софья» = «Софью» (было «Софию» от «София»)
const e2 = entries[13279];
if (e2?.msgstr.includes("Софию")) {
  e2.msgstr = e2.msgstr.replace("Софию", "Софью");
  n++;
}
writePoAtomic(PO, renderPo(entries, header));
console.log("записей изменено:", n);
