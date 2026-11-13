import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { isDefective, findTerms, registerMismatch, metaLeak } from "../.opencode/skills/translate/tone_lexicon.mts";
for (const lang of ["de", "es", "zh"]) {
  const text = readFileSync(`patches/ai-voice-pack/po/${lang}.po`, "utf-8").replace(/\r\n/gu, "\n");
  const entries = parsePo(text).filter((e) => e.msgid);
  const work = entries.map((e, idx) => ({ idx, e })).filter(({ e }) => e.msgstr && isDefective(e.msgstr, e.msgid, lang));
  console.log(`${lang}: work=${work.length}: ${work.slice(0, 12).map((w) => w.idx).join(",")}`);
  const zero = entries[0]!;
  console.log(`  idx0 EN=${JSON.stringify(zero.msgid)} TR=${JSON.stringify(zero.msgstr)} clin=${findTerms(zero.msgstr, lang).strong} reg=${registerMismatch(zero.msgstr, zero.msgid, lang)} leak=${metaLeak(zero.msgstr)}`);
}
