import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const e = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((x) => x.msgid && x.msgstr);
const BLUNT = /(?<![\p{L}])(bitch|slut|whore|cunt|pussy|cock|ass|fuck\w*|shit\w*)(?![\p{L}])/iu;
const SOFT: Array<[string, RegExp]> = [
  ["сучка", /(?<![\p{L}])сучк/iu],
  ["шлюшка", /(?<![\p{L}])шлюшк/iu],
  ["поп(к|очк)", /(?<![\p{L}])поп(?:к|очк)/iu],
  ["писюн/писька", /писюн|письк|пиписьк/iu],
  ["шлюха (для сравнения)", /(?<![\p{L}])шлюх/iu],
  ["сука (для сравнения)", /(?<![\p{L}])сук(?:а|и|у|ой|е)(?![\p{L}])/iu],
];
for (const [name, re] of SOFT) {
  const hits = e.filter((x) => re.test(x.msgstr));
  const blunt = hits.filter((x) => BLUNT.test(x.msgid));
  console.log(`${name.padEnd(24)} строк ${String(hits.length).padStart(3)} | из них EN грубый: ${blunt.length}`);
}
