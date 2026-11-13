import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const e = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8").replace(/\r\n/gu, "\n")).filter((x) => x.msgid);
for (const i of [14885, 23232, 3100, 14803, 18159, 43525, 51987, 59410]) {
  console.log(`\n[${i}]\n${e[i]!.msgstr}`);
}
