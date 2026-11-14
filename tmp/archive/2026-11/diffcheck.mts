import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const before = parsePo(readFileSync("tmp/po_ru_before_apply.po", "utf-8")).filter((e) => e.msgid);
const after = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((e) => e.msgid);
console.log("записей было/стало:", before.length, after.length);
const changed: number[] = [];
for (let i = 0; i < before.length; i++) {
  if (before[i].msgstr !== after[i].msgstr) {
    if (before[i].msgid !== after[i].msgid) console.log("СДВИГ на", i);
    changed.push(i);
  }
}
console.log("изменено записей:", changed.length);
const applied = new Set(readFileSync("tmp/tone_ru_applied.txt", "utf-8").trim().split("\n").map(Number));
const extra = changed.filter((i) => !applied.has(i));
console.log("изменено вне списка applied:", extra.length);
for (const i of extra.slice(0, 6))
  console.log(`\n[${i}] EN: ${after[i].msgid.slice(0, 80)}\n  было: ${before[i].msgstr.slice(0, 90)}\n  стало: ${after[i].msgstr.slice(0, 90)}`);
