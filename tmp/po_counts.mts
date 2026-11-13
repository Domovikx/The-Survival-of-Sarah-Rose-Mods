import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
for (const f of readdirSync("patches/ai-voice-pack/po").filter((x) => x.endsWith(".po")).toSorted()) {
  const e = parsePo(readFileSync(`patches/ai-voice-pack/po/${f}`, "utf-8")).filter((x) => x.msgid);
  const tr = e.filter((x) => x.msgstr).length;
  console.log(`${f.padEnd(8)} записей ${String(e.length).padStart(6)} | переведено ${String(tr).padStart(6)} (${((tr / e.length) * 100).toFixed(1)}%)`);
}
