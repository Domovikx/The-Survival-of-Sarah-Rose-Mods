import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const e = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((x) => x.msgid && x.msgstr);
const NAMES: Array<[string, RegExp]> = [
  ["bottom / her bottom", /(?<![\p{L}])bottoms?(?![\p{L}])/iu],
  ["butt / booty", /(?<![\p{L}])(butt|booty|behind|rear|backside)(?![\p{L}])/iu],
  ["cheeks", /(?<![\p{L}])cheeks?(?![\p{L}])/iu],
  ["little / cute + тело", /(?<![\p{L}])(little|cute|tiny)\s+\w*\s*(bottom|butt|ass|pussy|breasts?)/iu],
];
const RU: Array<[string, RegExp]> = [
  ["попка/попочка", /поп(?:к|очк)/iu],
  ["задница", /задниц/iu],
  ["ягодиц", /ягодиц/iu],
  ["попа", /(?<![\p{L}])поп(?:а|у|е|ой)(?![\p{L}])/iu],
  ["попа/попка ВСЕГО", /(?<![\p{L}])поп(?:а|у|е|ой|к|очк)/iu],
];
for (const [name, re] of NAMES) {
  const hits = e.filter((x) => re.test(x.msgid));
  const counts = RU.map(([n, r]) => `${n}: ${hits.filter((h) => r.test(h.msgstr)).length}`).join("  ");
  console.log(`\n${name}: строк ${hits.length}\n  ${counts}`);
  for (const h of hits.filter((h) => h.msgstr.length < 120).slice(0, 3))
    console.log(`  EN: ${h.msgid.slice(0, 88)}\n  RU: ${h.msgstr.slice(0, 88)}`);
}
