import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
for (const lang of ["pl", "ko", "zh"]) {
  const log = readFileSync(`tmp/judge_${lang}.log`, "utf-8");
  const idxs = [...log.matchAll(/^СУДЬЯ-BAD \[(\d+)\] (.*)$/gmu)].map((m) => ({ idx: Number(m[1]), why: m[2] }));
  const entries = parsePo(readFileSync(`patches/ai-voice-pack/po/${lang}.po`, "utf-8").replace(/\r\n/gu, "\n")).filter((e) => e.msgid);
  console.log(`\n########## ${lang} (${idxs.length})`);
  for (const { idx, why } of idxs) {
    const e = entries[idx]!;
    console.log(`\n[${idx}] ФЛАГ: ${why}`);
    console.log(`EN: ${e.msgid.replace(/\n/gu, " ⏎ ").slice(0, 220)}`);
    console.log(`TR: ${e.msgstr.replace(/\n/gu, " ⏎ ").slice(0, 220)}`);
  }
}
