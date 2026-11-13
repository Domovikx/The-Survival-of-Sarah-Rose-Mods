import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const e = parsePo(readFileSync("patches/ai-voice-pack/po/zh.po", "utf-8").replace(/\r\n/gu, "\n")).filter((x) => x.msgid);
for (const i of [1108, 1109, 1110, 1111, 1112, 1113, 1114, 1115, 1116]) {
  console.log(`[${i}] ${e[i]!.msgctxt}\n  EN: ${e[i]!.msgid.replace(/\n/gu, " ⏎ ")}\n  ZH: ${e[i]!.msgstr.replace(/\n/gu, " ⏎ ")}`);
}
