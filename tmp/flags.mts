import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { findTerms, registerMismatch, metaLeak } from "../.opencode/skills/translate/tone_lexicon.mts";
for (const lang of ["de", "es", "fr", "it", "pl", "pt", "ko", "zh", "ja"]) {
  const entries = parsePo(readFileSync(`patches/ai-voice-pack/po/${lang}.po`, "utf-8").replace(/\r\n/gu, "\n")).filter((e) => e.msgid);
  console.log(`\n===== ${lang}`);
  for (const [i, e] of entries.entries()) {
    if (!e.msgstr.trim()) continue;
    const clin = findTerms(e.msgstr, lang).strong;
    const reg = registerMismatch(e.msgstr, e.msgid, lang);
    const leak = metaLeak(e.msgstr);
    if (!clin.length && !reg.length && !leak.length) continue;
    console.log(`[${i}] clin=${clin.join(",") || "-"} reg=${reg.join(",") || "-"} leak=${leak.join(",") || "-"}`);
    console.log(`   EN: ${e.msgid.replace(/\n/gu, " ⏎ ").slice(0, 120)}`);
    console.log(`   TR: ${e.msgstr.replace(/\n/gu, " ⏎ ").slice(0, 120)}`);
  }
}
