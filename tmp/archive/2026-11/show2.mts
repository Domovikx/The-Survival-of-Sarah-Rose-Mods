import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const e = parsePo(readFileSync("patches/ai-voice-pack/po/es.po", "utf-8").replace(/\r\n/gu, "\n")).filter((x) => x.msgid);
console.log("712 ctxt:", e[712]!.msgctxt);
console.log("EN:", e[712]!.msgid);
console.log("TR:", e[712]!.msgstr);
console.log("--- 28240 ctxt:", e[28240]!.msgctxt, "| EN:", e[28240]!.msgid);
