/** Размер реального промпта судьи/правки на отказавшей строке. */
import { readFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { judgeSystem, judgeUser, systemPrompt } from "../.opencode/skills/renpy-po/po_translate.mts";
import { potIndex } from "../.opencode/skills/renpy-po/pot_resolve.mts";

const WANT = "For centuries, it has been the home of the Rose family.";
const entries = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid,
);
const i = entries.findIndex((e) => e.msgid === WANT);
const e = entries[i];
const prev = [entries[i - 3], entries[i - 2], entries[i - 1]]
  .filter(Boolean)
  .map((x) => `${x.msgctxt} ${x.msgid}`);

const sys = judgeSystem(e.msgctxt);
const usr = judgeUser("ru", e, e.msgstr, potIndex().emotion(e.msgctxt, e.msgid), prev);
const trans = systemPrompt("ru");

const tok = (s: string): number => Math.round(s.length / 3.6); // грубо, для кириллицы
console.log(`judge system : ${sys.length} симв (~${tok(sys)} ток)`);
console.log(`judge user   : ${usr.length} симв (~${tok(usr)} ток)`);
console.log(`итого судья  : ~${tok(sys + usr)} токенов`);
console.log(`translator systemPrompt: ${trans.length} симв (~${tok(trans)} ток)`);
