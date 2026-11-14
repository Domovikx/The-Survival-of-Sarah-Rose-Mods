import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { isDefective } from "../.opencode/skills/translate/tone_lexicon.mts";
const e = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((x) => x.msgid);
const idx = e.map((x, i) => (x.msgstr && isDefective(x.msgstr, x.msgid, "ru") ? i : -1)).filter((i) => i >= 0);
console.log(idx.join(","));
