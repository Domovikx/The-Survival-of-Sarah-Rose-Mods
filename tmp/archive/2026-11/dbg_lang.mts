import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { findTerms, isDefective, registerMismatch, metaLeak } from "../.opencode/skills/translate/tone_lexicon.mts";
for (const lang of ["de", "es", "zh"]) {
  const entries = parsePo(readFileSync(`patches/ai-voice-pack/po/${lang}.po`, "utf-8")).filter((e) => e.msgid);
  console.log(`\n== ${lang}: записей ${entries.length}, переведено ${entries.filter((e) => e.msgstr.trim()).length}`);
  for (const [i, e] of entries.entries()) {
    if (!e.msgstr.trim()) continue;
    if (!isDefective(e.msgstr, e.msgid, lang)) continue;
    console.log(` [${i}] клиника=${findTerms(e.msgstr, lang).strong.join(",")} регистр=${registerMismatch(e.msgstr, e.msgid, lang).join(",")} мусор=${metaLeak(e.msgstr).join(",")}`);
    console.log(`     EN: ${e.msgid.slice(0, 90)}`);
    console.log(`     TR: ${e.msgstr.slice(0, 90)}`);
  }
}
