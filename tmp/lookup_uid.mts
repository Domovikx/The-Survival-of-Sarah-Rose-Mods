import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const want = process.argv[2];
const e = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8").replace(/\r\n/gu, "\n")).filter((x) => x.msgid);
for (const x of e) {
  if (createHash("md5").update(x.msgid, "utf8").digest("hex") === want) {
    console.log(`EN: ${x.msgid}\nRU: ${x.msgstr}`);
  }
}
