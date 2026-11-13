import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { findTerms, isDefective, registerMismatch } from "../.opencode/skills/translate/tone_lexicon.mts";
const entries = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((e) => e.msgid);
const idx: number[] = [];
for (const [i, e] of entries.entries()) {
  if (!e.msgstr || !isDefective(e.msgstr, e.msgid, "ru")) continue;
  idx.push(i);
  const t = findTerms(e.msgstr, "ru");
  console.log(`[${i}] клиника=${t.strong.join(",") || "—"} | регистр=${registerMismatch(e.msgstr, e.msgid, "ru").join(",") || "—"}`);
  console.log(`   EN: ${e.msgid.slice(0, 100)}`);
  console.log(`   RU: ${e.msgstr.slice(0, 100)}`);
}
console.log("\nсписок:", idx.join(","));
