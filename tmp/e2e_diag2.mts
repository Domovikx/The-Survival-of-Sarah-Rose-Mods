// Диагностика 2: реальные issues от translateEntry на тех же строках.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { translateEntry } from "../.opencode/skills/renpy-po/po_translate.mts";

const REPO = process.cwd();
const LANGS = ["de", "ja", "ko"];

function rejected(lang: string, limit: number): string[] {
  const f = join(REPO, "tmp", `po_translate_${lang}.jsonl`);
  if (!existsSync(f)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const lines = readFileSync(f, "utf-8").split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    let r: { rejected?: boolean; error?: unknown; msgid?: string };
    try {
      r = JSON.parse(lines[i]) as typeof r;
    } catch {
      continue;
    }
    if (!r.rejected || r.error || !r.msgid || r.msgid.length < 30 || r.msgid.length > 150) continue;
    if (seen.has(r.msgid)) continue;
    seen.add(r.msgid);
    out.push(r.msgid);
  }
  return out;
}

for (const lang of LANGS) {
  const po = readFileSync(join(REPO, "patches/ai-voice-pack/po", `${lang}.po`), "utf-8");
  const ents = parsePo(po.replace(/\r\n/g, "\n")).filter((e) => e.msgid);
  console.log(`\n########## ${lang} ##########`);
  for (const msgid of rejected(lang, 3)) {
    const entry = ents.find((e) => e.msgid === msgid);
    if (!entry) continue;
    const r = await translateEntry("http://127.0.0.1:1234", "qwen/qwen3.5-9b", lang, entry, [], [], true, 9, null, 6);
    console.log(`\nEN: ${msgid.slice(0, 85)}`);
    console.log(`  принято: ${r.tr ? "ДА" : "НЕТ"} | судья: ${r.judgeScore} | попыток: ${r.tries}`);
    if (r.tr) console.log(`  TR: ${r.tr.slice(0, 150)}`);
    for (const i of r.issues.slice(0, 4)) console.log(`  - ${i.slice(0, 150)}`);
  }
}
