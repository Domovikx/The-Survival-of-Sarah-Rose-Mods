import { readFileSync, writeFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

const entries = parsePo(readFileSync("patches/ai-voice-pack/po/ja.po", "utf-8").replace(/\r\n/gu, "\n")).filter(
  (e) => e.msgid,
);
const idx = entries.map((e, i) => (e.msgstr && e.msgctxt !== "speaker-name" ? i : -1)).filter((i) => i >= 0);
for (let k = 0; k < 4; k++) {
  writeFileSync(`tmp/ja_part${k}.txt`, idx.filter((_, n) => n % 4 === k).join("\n"));
}
console.log(`ja: ${idx.length} строк на 4 части`);
