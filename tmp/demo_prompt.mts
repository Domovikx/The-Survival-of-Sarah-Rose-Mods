/** Демо: что РЕАЛЬНО видит переводчик (userPrompt) для конкретной строки. */
import { readFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { potIndex } from "../.opencode/skills/renpy-po/pot_resolve.mts";
import { translatorContext, userPrompt } from "../.opencode/skills/renpy-po/po_translate.mts";

const LANG = process.argv[2] ?? "ru";
const WANT = process.argv[3] ?? "A cunt.";

const entries = parsePo(readFileSync(`patches/ai-voice-pack/po/${LANG}.po`, "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid,
);
const idx = entries.findIndex((e) => e.msgid === WANT);
if (idx < 0) {
  console.log(`нет строки: ${WANT}`);
  process.exit(1);
}
const entry = entries[idx];
const { prev, next } = translatorContext(entries, idx);
const ctxAt = (e: { msgctxt: string; msgid: string }): string[] => [`${e.msgctxt || ""} ${e.msgid}`];
const emotion = potIndex().emotion(entry.msgctxt, entry.msgid);
console.log(`=== ${LANG}.po, запись №${idx} (src из POT) ===`);
console.log(userPrompt(entry, prev.flatMap(ctxAt), next.flatMap(ctxAt), "", emotion));
