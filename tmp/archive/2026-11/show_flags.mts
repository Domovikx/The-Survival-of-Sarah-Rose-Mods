import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const cases: Array<[string, number]> = [["fr", 237], ["it", 183], ["it", 387], ["it", 449]];
for (const [lang, i] of cases) {
  const entries = parsePo(readFileSync(`patches/ai-voice-pack/po/${lang}.po`, "utf-8").replace(/\r\n/gu, "\n")).filter((e) => e.msgid);
  const e = entries[i]!;
  console.log(`\n[${lang} ${i}] ${e.msgctxt}`);
  console.log("EN:", e.msgid.replace(/\n/gu, " ⏎ ").slice(0, 260));
  console.log("TR:", e.msgstr.replace(/\n/gu, " ⏎ ").slice(0, 260));
}
