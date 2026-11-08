/**
 * Разовый ремонт: три легаси-вклейки соседних строк (всплыли после унификации
 * имён — правка сделала tr≠HEAD, гейт УТЕЧКА активировался). 2026-11-06.
 * Запуск: node tmp/fix_glue3.mts
 */
import { readFileSync } from "node:fs";

import { parsePo, renderPo, writePoAtomic } from "../.opencode/skills/renpy-po/po_core.mts";

const PO = "patches/ai-voice-pack/po/ru.po";
const text = readFileSync(PO, "utf-8").replace(/\r\n/g, "\n");
const entries = parsePo(text).filter((e) => e.msgid);
const header = text.split("\n\n")[0].split("\n");

const fixes = new Map<number, string>([
  [37840, "Сара снова посмотрела в окно."],
  [47135, "Вскоре она снова вышла на дорогу и увидела повозку с остальными, ожидавшими там."],
  [47207, "Лошади были в хорошем настроении, а препятствий было мало, поэтому они продвигались быстро."],
]);

for (const [i, val] of fixes) {
  console.log(`[${i}] было: ${entries[i].msgstr}`);
  entries[i].msgstr = val;
}
writePoAtomic(PO, renderPo(entries, header));
console.log("исправлено:", fixes.size);
