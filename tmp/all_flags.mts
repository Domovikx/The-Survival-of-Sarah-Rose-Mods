import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const LANGS = ["de", "es", "fr", "it", "pl", "pt", "ko", "zh", "ja"];
let total = 0;
for (const lang of LANGS) {
  const files = lang === "ja"
    ? [0, 1, 2, 3].map((k) => `tmp/judge_ja_part${k}.log`)
    : [`tmp/judge_${lang}.log`];
  const flags: Array<{ idx: number; why: string }> = [];
  for (const f of files) {
    for (const m of readFileSync(f, "utf-8").matchAll(/^СУДЬЯ-BAD \[(\d+)\] (.*)$/gmu)) flags.push({ idx: Number(m[1]), why: m[2] });
  }
  total += flags.length;
  console.log(`\n########## ${lang}: ${flags.length}`);
  const entries = parsePo(readFileSync(`patches/ai-voice-pack/po/${lang}.po`, "utf-8").replace(/\r\n/gu, "\n")).filter((e) => e.msgid);
  for (const { idx, why } of flags) {
    const e = entries[idx]!;
    console.log(`[${idx}] ${why}\n  EN: ${e.msgid.replace(/\n/gu, " ⏎ ").slice(0, 170)}\n  TR: ${e.msgstr.replace(/\n/gu, " ⏎ ").slice(0, 170)}`);
  }
}
console.log(`\nВСЕГО: ${total}`);
