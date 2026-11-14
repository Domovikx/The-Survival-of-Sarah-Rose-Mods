/** Дрейф названия места: «Росанн» → «Розанна» во всех msgstr (канон корпуса). */
import { readFileSync } from "node:fs";

import { writePoAtomic } from "../.opencode/skills/renpy-po/po_core.mts";

const PO = "patches/ai-voice-pack/po/ru.po";
const text = readFileSync(PO, "utf-8").replace(/\r\n/g, "\n");
let n = 0;
const out = text
  .split("\n")
  .map((line) => {
    if (line.startsWith("msgstr ") && line.includes("Росанн")) {
      n++;
      return line.replace(/Росанн/g, "Розанн");
    }
    return line;
  })
  .join("\n");
writePoAtomic(PO, out);
console.log("заменено строк msgstr:", n);
