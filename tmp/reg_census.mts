import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const e = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po","utf-8")).filter(x=>x.msgid);
// как корпус УЖЕ переводит pussy/cock/ass/cunt
const map: Array<[string, RegExp]> = [
  ["pussy", /pussy/iu], ["cock", /\bcock\b/iu], ["cunt", /\bcunt\b/iu],
  ["ass", /\bass\b/iu], ["sex (her sex)", /her sex\b/iu], ["clit", /\bclit\b/iu],
];
const words = (s: string) => s.toLowerCase().match(/[а-яё]+(?:-[а-яё]+)*/gu) ?? [];
for (const [name, re] of map) {
  const hits = e.filter(x => re.test(x.msgid));
  const cnt = new Map<string, number>();
  for (const h of hits) for (const w of words(h.msgstr)) cnt.set(w, (cnt.get(w) ?? 0) + 1);
  const top = [...cnt].filter(([w]) => !["и","в","её","ее","на","с","не","а","что","как","его","она","он","её"].includes(w)).sort((a,b)=>b[1]-a[1]).slice(0, 12);
  console.log(`\n${name}: строк ${hits.length}`);
  console.log("  " + top.map(([w,n])=>`${w}:${n}`).join("  "));
}
