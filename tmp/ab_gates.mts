import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { checkEdit, findTerms, metaLeak } from "../.opencode/skills/translate/tone_lexicon.mts";

const entries = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8").replace(/\r\n/gu, "\n")).filter((e) => e.msgid);

function rows(path: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const m of readFileSync(path, "utf-8").matchAll(/^### \[(\d+)\/\d+\] idx (\d+) [^\n]*\n  EN:[^\n]*\n  было:[^\n]*\n  стало: ([^\n]*)/gmu)) {
    out.set(Number(m[2]), m[3]!);
  }
  return out;
}
for (const [name, path] of [["Q4", "tmp/ab_q4.log"], ["PLaMo", "tmp/ab_plamo.log"]] as const) {
  const map = rows(path);
  const issues: string[] = [];
  let clin = 0, leak = 0;
  for (const [idx, neu] of map) {
    const old = entries[idx]!.msgstr;
    const g = checkEdit(old, neu, "ru");
    if (findTerms(neu, "ru").strong.length) clin++;
    if (metaLeak(neu).length) leak++;
    if (g.length) issues.push(`[${idx}] ${g.join("; ")}`);
  }
  console.log(`\n=== ${name}: строк ${map.size}, клиника ${clin}, мусор ${leak}, гейтов ${issues.length}`);
  for (const s of issues.slice(0, 15)) console.log("  " + s);
}
