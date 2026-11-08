import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const entries = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);
const i = entries.findIndex((e) => e.msgid.startsWith("Speaking of growing up"));
console.log(`строка №${i} — в промпт входили:`);
for (const k of [-3, -2, -1]) {
  const x = entries[i + k];
  if (x) console.log(`  [ДО ${3 + k}] ${x.msgctxt}: ${x.msgid}`);
}
console.log(`  [ЦЕЛЬ  ] ${entries[i].msgctxt}: ${entries[i].msgid}`);
const nx = entries[i + 1];
if (nx) console.log(`  [ПОСЛЕ ] ${nx.msgctxt}: ${nx.msgid}`);
