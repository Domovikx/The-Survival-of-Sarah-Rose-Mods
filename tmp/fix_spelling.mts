/**
 * Точечная замена написания в msgstr (кроме строк speaker-name — канон не трогаем).
 * Запуск: node tmp/fix_spelling.mts <from> <to>
 */
import { readFileSync } from "node:fs";

import { parsePo, renderPo, writePoAtomic } from "../.opencode/skills/renpy-po/po_core.mts";

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error("usage: node tmp/fix_spelling.mts <from> <to>");
  process.exit(2);
}

const PO = "patches/ai-voice-pack/po/ru.po";
const text = readFileSync(PO, "utf-8").replace(/\r\n/g, "\n");
const entries = parsePo(text).filter((e) => e.msgid);
const header = text.split("\n\n")[0].split("\n");

let n = 0;
for (const e of entries) {
  if (e.msgctxt === "speaker-name" || !e.msgstr.includes(from)) continue;
  e.msgstr = e.msgstr.split(from).join(to);
  n++;
}
writePoAtomic(PO, renderPo(entries, header));
console.log(`${from} -> ${to}: заменено в ${n} записях`);
