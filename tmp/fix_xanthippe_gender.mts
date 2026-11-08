/** Фикс рода: Xanthippe = М (script.rpy: he/his/the man). Одноразовый. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePo, renderPo, writePoAtomic } from "../.opencode/skills/renpy-po/po_core.mts";
import { poHeaderLines } from "../.opencode/skills/renpy-po/po_update.mts";

const PO = join(process.cwd(), "patches", "ai-voice-pack", "po", "ru.po");
const FIXES: Record<string, string> = {
  "But I'm happy it didn't end in tragedy.":
    "Но я рад, что это не закончилось трагедией.",
};
const text = readFileSync(PO, "utf-8").replace(/\r\n/g, "\n");
const entries = parsePo(text);
let n = 0;
for (const e of entries) {
  const next = FIXES[e.msgid];
  if (next !== undefined && e.msgstr !== next) {
    console.log(`ПРАВКА РОДА: ${e.msgstr} -> ${next}`);
    e.msgstr = next;
    n++;
    delete FIXES[e.msgid];
  }
}
if (Object.keys(FIXES).length) {
  console.error("НЕ НАЙДЕНО:", Object.keys(FIXES));
  process.exit(2);
}
if (n) writePoAtomic(PO, renderPo(entries, poHeaderLines(text)));
console.log(`исправлено строк рода: ${n}`);
