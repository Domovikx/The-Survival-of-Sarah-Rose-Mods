import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { isDefective } from "../.opencode/skills/translate/tone_lexicon.mts";
const LANG = "de";
const text = readFileSync(join("patches", "ai-voice-pack", "po", `${LANG}.po`), "utf-8").replace(/\r\n/gu, "\n");
const entries = parsePo(text).filter((e) => e.msgid);
const work = entries.map((e, idx) => ({ idx, e })).filter(({ e }) => e.msgstr && isDefective(e.msgstr, e.msgid, LANG));
console.log("work:", work.map((w) => [w.idx, w.e.msgid.slice(0, 40), w.e.msgstr.slice(0, 40)]));
