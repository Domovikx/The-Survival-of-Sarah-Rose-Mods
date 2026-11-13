import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { findTerms, isDefective, registerMismatch } from "../.opencode/skills/translate/tone_lexicon.mts";
const LANGS = ["ru", "de", "es", "fr", "it", "pl", "pt", "ko", "zh", "ja"];
for (const lang of LANGS) {
  const entries = parsePo(readFileSync(`patches/ai-voice-pack/po/${lang}.po`, "utf-8")).filter((e) => e.msgid);
  const tr = entries.filter((e) => e.msgstr.trim());
  const clin: Record<string, number> = {};
  const soft: Record<string, number> = {};
  let bad = 0;
  for (const e of tr) {
    if (isDefective(e.msgstr, e.msgid, lang)) bad++;
    for (const t of findTerms(e.msgstr, lang).strong) clin[t] = (clin[t] ?? 0) + 1;
    for (const r of registerMismatch(e.msgstr, e.msgid, lang)) soft[r] = (soft[r] ?? 0) + 1;
  }
  const top = Object.entries(clin).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(
    `${lang}: переведено ${tr.length}/${entries.length} | дефектных ${bad} | ` +
      `топ: ${top.map(([k, v]) => `${k}×${v}`).join(", ") || "—"}` +
      (Object.keys(soft).length ? ` | регистр: ${Object.keys(soft).join(", ")}` : ""),
  );
}
