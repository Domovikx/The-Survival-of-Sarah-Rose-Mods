import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const e = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((x) => x.msgid && x.msgstr);
const hits = e.filter((x) => /\bher sex\b/i.test(x.msgid));
console.log(`строк с "her sex": ${hits.length}`);
const groups: Array<[string, RegExp]> = [
  ["половые органы", /половы[ех]\s+орган/iu],
  ["киск", /киск/iu],
  ["между ног", /между\s+ног/iu],
  ["плоть", /плоть|плоти/iu],
  ["внутрь/в неё", /внутрь|в неё/iu],
  ["лоно", /лон[оауе]/iu],
  ["влагалищ", /влагалищ/iu],
];
const used = new Set<number>();
for (const [name, re] of groups) {
  const idx = hits.map((h, i) => (re.test(h.msgstr) ? i : -1)).filter((i) => i >= 0);
  idx.forEach((i) => used.add(i));
  console.log(`  ${name.padEnd(16)} ${idx.length}`);
}
console.log(`  остальное        ${hits.length - used.size}`);
for (const h of hits.filter((x) => !groups.some(([, re]) => re.test(x.msgstr))).slice(0, 5))
  console.log(`   EN: ${h.msgid.slice(0, 80)}\n   RU: ${h.msgstr.slice(0, 80)}`);
