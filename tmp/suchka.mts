import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const e = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((x) => x.msgid && x.msgstr);
const groups: Array<[string, RegExp]> = [
  ["сучка/сучку (в RU)", /(?<![\p{L}])сучк/iu],
  ["сука (в RU)", /(?<![\p{L}])сук(?:а|и|у|ой|е)(?![\p{L}])/iu],
  ["EN bitch", /(?<![\p{L}])bitches?|bitchy(?![\p{L}])/iu],
];
for (const [name, re] of groups) {
  const hits = e.filter((x) => re.test(name.includes("EN") ? x.msgid : x.msgstr));
  console.log(`\n${name}: строк ${hits.length}`);
  for (const h of hits.slice(0, 6)) console.log(`  EN: ${h.msgid.slice(0, 95)}\n  RU: ${h.msgstr.slice(0, 95)}`);
}
