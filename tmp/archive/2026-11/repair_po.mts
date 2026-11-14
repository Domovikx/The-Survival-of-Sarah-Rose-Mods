import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ALL_LANGS, parsePo, renderPo, writePoAtomic } from "../.opencode/skills/renpy-po/po_core.mts";

for (const lang of ALL_LANGS) {
  const rel = join("patches", "ai-voice-pack", "po", `${lang}.po`);
  const text = readFileSync(rel, "utf-8").replace(/\r\n/gu, "\n");
  const parsed = parsePo(text);
  const empties = parsed.filter((e) => !e.msgid).length;
  const header = text.split("\n\n")[0]!.split("\n");
  const entries = parsed.filter((e) => e.msgid);
  writePoAtomic(rel, renderPo(entries, header));
  console.log(`${lang}: пустых msgid было ${empties} -> 0, записей ${entries.length}`);
}
