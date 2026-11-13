import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const e = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((x) => x.msgid && x.msgstr);
for (const h of e.filter((x) => /(?<![\p{L}])поп(?:а|у|е|ой|к|очк)/iu.test(x.msgstr)))
  console.log(`EN: ${h.msgid.slice(0, 95)}\nRU: ${h.msgstr.slice(0, 95)}\n`);
