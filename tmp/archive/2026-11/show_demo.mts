import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const ask: Array<[string, number]> = [
  ["de",30296],["fr",237],["fr",30296],["it",69078],["pl",15174],["pl",30296],
  ["ko",1037],["ko",30296],["zh",700],["zh",890],["zh",16332],["zh",30296],
  ["ja",700],["ja",30296],["es",47016],["es",65797],
];
for (const [lang, i] of ask) {
  const e = parsePo(readFileSync(`patches/ai-voice-pack/po/${lang}.po`, "utf-8").replace(/\r\n/gu, "\n")).filter((x) => x.msgid);
  console.log(`\n[${lang} ${i}] ${e[i]!.msgctxt}\nEN: ${e[i]!.msgid.replace(/\n/gu, " ⏎ ")}\nTR: ${e[i]!.msgstr.replace(/\n/gu, " ⏎ ")}`);
}
