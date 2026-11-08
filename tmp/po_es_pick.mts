/** Сравнение переводов: существующий qwen3.5-9b (po/es.po) vs вывод Strata (tmp). */
import { readFileSync } from "node:fs";

const PO = "patches/ai-voice-pack/po/es.po";
const txt = readFileSync(PO, "utf8");

// Простой po-парсер: блоки msgid/msgstr (однострочные + мультистрочные).
const blocks = txt.split(/\n\n+/);
const pairs: Array<{ id: string; str: string }> = [];
for (const b of blocks) {
  const mid = b.match(/^msgid "((?:[^"\\]|\\.)*)"/m);
  const mstr = b.match(/^msgstr "((?:[^"\\]|\\.)*)"/m);
  if (mid && mstr && mid[1]) {
    // мультистрочные продолжения
    const cont = [...b.matchAll(/^"((?:[^"\\]|\\.)*)"$/gm)].map((m) => m[1]);
    pairs.push({ id: mid[1], str: mstr[1] + cont.join("") });
  }
}

const WANT = [
  "Ooh no, not this one, try that one",
  "A preliminary Analysis on Snow Crystal",
  "The Desert Blooms",
  "A Queen with no crown",
  "A bead of sweat fell from Naydeen",
  "A black liquid spewed out",
  "A Brief Investigation on Ethics",
  "A Tribesmen, caught from his horse",
  "A black, oily tongue",
  "A hundred men would die tonight",
];

let found = 0;
for (const w of WANT) {
  const hit = pairs.find((p) => p.id.includes(w) && p.str);
  if (hit) {
    console.log(`EN : ${hit.id}`);
    console.log(`9B : ${hit.str}`);
    console.log("");
    found++;
  }
}
console.log(`найдено ${found} из ${WANT.length}`);
