import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const ask: Array<[string, number]> = [["pl", 808], ["pl", 1157], ["pl", 15174], ["zh", 692], ["zh", 1010], ["zh", 1114], ["zh", 16332], ["ko", 1037]];
for (const [lang, i] of ask) {
  const e = parsePo(readFileSync(`patches/ai-voice-pack/po/${lang}.po`, "utf-8").replace(/\r\n/gu, "\n")).filter((x) => x.msgid);
  console.log(`\n[${lang} ${i}] ${e[i]!.msgctxt}\nEN: ${e[i]!.msgid.replace(/\n/gu, " ⏎ ")}\nTR: ${e[i]!.msgstr.replace(/\n/gu, " ⏎ ")}`);
}
