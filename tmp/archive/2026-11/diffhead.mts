import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const head = parsePo(readFileSync("tmp/po_head.po", "utf-8")).filter((e) => e.msgid);
const snap = parsePo(readFileSync("tmp/po_ru_before_apply.po", "utf-8")).filter((e) => e.msgid);
const now = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((e) => e.msgid);
const cnt = (a: typeof head, b: typeof head) => a.filter((e, i) => e.msgstr !== b[i]?.msgstr).length;
console.log("HEAD -> снимок до применения:", cnt(head, snap));
console.log("HEAD -> сейчас:", cnt(head, now));
