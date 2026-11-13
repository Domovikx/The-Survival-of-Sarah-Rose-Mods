import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const e = parsePo(readFileSync("patches/ai-voice-pack/po/template.pot", "utf-8").replace(/\r\n/gu, "\n")).filter((x) => x.msgid);
const content = e.filter((x) => x.msgctxt.startsWith("speaker:") && x.msgctxt !== "speaker-name");
const chars = content.reduce((s, x) => s + x.msgid.length, 0);
const avg = chars / content.length;
console.log(`контентных строк: ${content.length}`);
console.log(`символов EN: ${chars} (средняя строка ${avg.toFixed(1)} симв.)`);
// Оценка токенов: EN ~4 симв/токен; немецкий выход ~1.15x; контекст 3+1 строки + промпт ~350 ток.
const inTok = chars / 4 + content.length * (avg * 4 / 4 + 350);
const outTok = (chars / 4) * 1.15;
console.log(`вход ~${(inTok / 1e6).toFixed(2)}M токенов, выход ~${(outTok / 1e6).toFixed(2)}M токенов`);
// Вариант без контекста (только промпт ~150 ток.)
const inTok2 = chars / 4 + content.length * 150;
console.log(`без контекста: вход ~${(inTok2 / 1e6).toFixed(2)}M, выход ~${(outTok / 1e6).toFixed(2)}M`);
