import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
for (const lang of ["de", "it"]) {
  const es = parsePo(readFileSync(`patches/ai-voice-pack/po/${lang}.po`, "utf-8").replace(/\r\n/gu, "\n")).filter((e) => e.msgid);
  console.log(`\n===== ${lang}`);
  for (const [i, e] of es.entries()) {
    if (!e.msgstr.trim() || e.msgstr.trim() !== e.msgid.trim()) continue;
    console.log(` [${i}] ${e.msgctxt} | ${e.msgid.replace(/\n/gu, " ⏎ ").slice(0, 90)}`);
  }
}
