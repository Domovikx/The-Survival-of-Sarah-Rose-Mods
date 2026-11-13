import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { charsOf } from "../.opencode/skills/translate/judge_client.mts";
const entries = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((e) => e.msgid);
const NAME_CANON = new Map<string, string>();
for (const e of entries)
  if (e.msgctxt === "speaker-name" && e.msgid && e.msgstr.trim() && !NAME_CANON.has(e.msgid))
    NAME_CANON.set(e.msgid, e.msgstr.trim());
console.log("speaker-name записей:", NAME_CANON.size);
console.log("Belmont в каноне:", NAME_CANON.get("Belmont"));
const e = entries[18159]!;
console.log("ctxt:", e.msgctxt, "| EN:", e.msgid.slice(0, 60));
console.log("charsOf:", JSON.stringify(charsOf(e.msgctxt, e.msgid, NAME_CANON)));
