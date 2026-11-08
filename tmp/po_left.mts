/** Сводка остатка es: idx + метаданные POT (arc/scene/emotion) для пустых строк. */
import { readFileSync } from "node:fs";

import { parsePo, poEscape } from "../.opencode/skills/renpy-po/po_core.mts";

const POT = "patches/ai-voice-pack/po/template.pot";
const pot = readFileSync(POT, "utf-8");
const es = parsePo(readFileSync("patches/ai-voice-pack/po/es.po", "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid,
);

function meta(id: string): { arc?: string; scene?: string; emotion?: string } {
  const i = pot.indexOf(`msgid "${poEscape(id)}"`);
  if (i < 0) return {};
  const head = pot.slice(Math.max(0, i - 500), i);
  const g = (re: RegExp): string => (head.match(re) ?? [])[1] ?? "";
  return { arc: g(/#\. arc: (.+)/), scene: g(/#\. scene: (.+)/), emotion: g(/#\. emotion: (.+)/) };
}

let n = 0;
for (let i = 0; i < es.length; i++) {
  const e = es[i];
  if (e.msgstr.trim()) continue;
  n++;
  const m = meta(e.msgid);
  console.log(`### idx=${i}  arc=${m.arc ?? "?"}  scene=${m.scene ?? "?"}  emotion=${m.emotion ?? "?"}`);
  console.log(`EN: ${e.msgid}`);
  console.log("");
}
console.log(`всего пустых: ${n}`);
