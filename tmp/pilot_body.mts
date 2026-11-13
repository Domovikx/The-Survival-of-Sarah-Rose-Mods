import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

const lang = process.argv[2] ?? "de";
const e = parsePo(readFileSync(`patches/ai-voice-pack/po/${lang}.po`, "utf-8")).filter((x) => x.msgid && x.msgstr);
const RE = /(?<![\p{L}])(pussy|cock|cunt|ass|her sex|clit\w*)(?![\p{L}])/iu;
const hits = e.filter((x) => RE.test(x.msgid));
console.log(`== ${lang}: переведено ${e.length}, из них с телесной лексикой EN: ${hits.length}`);
for (const h of hits.slice(0, 8)) {
  const t = RE.exec(h.msgid)?.[0] ?? "?";
  console.log(`\n [${t}] EN: ${h.msgid.slice(0, 100)}\n       ${lang.toUpperCase()}: ${h.msgstr.slice(0, 100)}`);
}
