/** Демо: блок контекста судьи — что именно в него попадает (msgid или msgstr). */
import { readFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { judgeUser } from "../.opencode/skills/renpy-po/po_translate.mts";

const LANG = "ru";
const WANT = "A cunt.";
const entries = parsePo(readFileSync(`patches/ai-voice-pack/po/${LANG}.po`, "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid,
);
const i = entries.findIndex((e) => e.msgid === WANT);
const prev = [entries[i - 2], entries[i - 1]].filter(Boolean).map((x) => `${x.msgctxt} ${x.msgid}`);
const e = entries[i];
console.log(`=== судья, строка: ${JSON.stringify(e.msgid)} ===`);
console.log(`msgstr (перевод, ЕГО судья не берёт в контекст): ${JSON.stringify(e.msgstr)}\n`);
const u = judgeUser(LANG, e, e.msgstr, "Sarcastically amused", prev);
const ctxBlock = u.slice(u.indexOf("CONTEXT (2 previous lines"), u.indexOf("SOURCE (always English"));
console.log(ctxBlock);
console.log("--- и сравнение: msgid соседей vs их msgstr в po ---");
for (const x of [entries[i - 2], entries[i - 1]]) {
  console.log(`  msgid : ${x.msgid}`);
  console.log(`  msgstr: ${x.msgstr}`);
}
