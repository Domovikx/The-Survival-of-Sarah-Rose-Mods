import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const entries = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((e) => e.msgid);
// Признаки вклеенного рассуждения модели/служебного текста в сам перевод.
const PATS: Array<[string, RegExp]> = [
  ["пол в скобках", /\((?:муж|жен)ск\S*\s+род\S*\)/iu],
  ["рассуждение", /(?:повествовател|переводчик|в оригинале|оригинал\S*\s+говор|исходн\S*\s+текст|注|翻译|translator|narrator\s)/iu],
  ["служебный префикс", /(?:^|\n)\s*(?:RU|EN|Translation|Перевод)\s*[:：]/u],
  ["латиница фразой", /[A-Za-z]{4,}\s+[A-Za-z]{4,}\s+[A-Za-z]{4,}/u],
];
for (const [name, re] of PATS) {
  const hits = entries.map((e, i) => ({ i, e })).filter(({ e }) => e.msgstr && re.test(e.msgstr));
  console.log(`\n${name}: ${hits.length}`);
  for (const { i, e } of hits.slice(0, 8)) console.log(`  [${i}] ${e.msgstr.slice(0, 150).replace(/\n/g, " ⏎ ")}`);
}
