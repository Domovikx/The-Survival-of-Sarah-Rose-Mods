import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

const lang = process.argv[2] ?? "ru";
const e = parsePo(readFileSync(`patches/ai-voice-pack/po/${lang}.po`, "utf-8")).filter((x) => x.msgid && x.msgstr);

const GROUPS: Array<[string, RegExp]> = [
  ["попка/попочка", /(?<![\p{L}])поп(?:к|очк|ец)/iu],
  ["пиписька/писюн", /пиписьк|писюн|письк|писечк|пипк/iu],
  ["интимные места", /интимн|сокровенн|причинн(?:ое|ого) место|низ живота/iu],
  ["прелести", /прелест|богатств|достоинств/iu],
  ["детородный", /детородн|чрево/iu],
  ["киска(есть)", /киск/iu],
  ["задница(есть)", /задниц/iu],
];

for (const [name, re] of GROUPS) {
  const hits = e.filter((x) => re.test(x.msgstr));
  console.log(`${name.padEnd(16)} строк ${String(hits.length).padStart(4)}`);
  for (const h of hits.slice(0, 2)) console.log(`    EN: ${h.msgid.slice(0, 90)}\n    RU: ${h.msgstr.slice(0, 90)}`);
}
