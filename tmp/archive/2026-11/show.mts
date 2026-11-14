import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const entries = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((e) => e.msgid);
for (const i of [17842, 32412, 37609, 59729, 50913, 18159, 51987]) {
  const e = entries[i]!;
  console.log(`\n[${i}] ctxt=${e.msgctxt}`);
  console.log(`EN: ${e.msgid.replace(/\n/g, " ⏎ ")}`);
  console.log(`RU: ${e.msgstr.replace(/\n/g, " ⏎ ")}`);
}
