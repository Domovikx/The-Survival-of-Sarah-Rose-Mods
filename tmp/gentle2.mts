import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const e = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((x) => x.msgid && x.msgstr);
// только телесные контексты: hers/his + слово, или слово + грудь/бедро
const BODY = /(?<![\p{L}])(her|his|my|your)\s+(ass|butt|bottom|behind|rear)(?![\p{L}])|(ass|butt|bottom)\s+(cheeks|hole)|(?<![\p{L}])butt(?![\p{L}])/iu;
const hits = e.filter((x) => BODY.test(x.msgid));
const pair = (re: RegExp) => hits.filter((h) => re.test(h.msgstr)).length;
console.log(`телесных строк с ass/butt/bottom: ${hits.length}`);
for (const [n, r] of [
  ["задниц", /задниц/iu],
  ["ягодиц", /ягодиц/iu],
  ["поп(а|к)", /(?<![\p{L}])поп(?:а|у|е|ой|к|очк)/iu],
  ["жоп(а)", /(?<![\p{L}])жоп/iu],
] as Array<[string, RegExp]>) console.log(`  ${n}: ${pair(r)}`);
console.log();
for (const h of hits.slice(0, 10)) console.log(`EN: ${h.msgid.slice(0, 92)}\nRU: ${h.msgstr.slice(0, 92)}\n`);
