// Диагностика остатка в ctxt-срезе (menu/ui/speaker-name).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

const REPO = process.cwd();
const CTX = new Set(["menu", "ui", "speaker-name"]);
const LANGS = ["de", "fr", "it", "pl", "pt", "ja", "ko", "zh", "ru", "es"];

function lastRecord(lang: string, msgid: string): { issues: string[]; judge: number } | null {
  const f = join(REPO, "tmp", `po_translate_${lang}.jsonl`);
  if (!existsSync(f)) return null;
  const lines = readFileSync(f, "utf-8").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]) continue;
    try {
      const r = JSON.parse(lines[i]) as { msgid?: string; rejected?: boolean; issues?: string[]; judge?: number };
      if (r.msgid === msgid) return { issues: r.issues ?? [], judge: r.judge ?? -1 };
    } catch {
      /* пропуск */
    }
  }
  return null;
}

function bucket(issues: string[], judge: number): string {
  const s = issues.join(" | ").toLowerCase();
  if (!issues.length && judge === -1) return "нет диагностики";
  if (/msgstr == msgid|не переведено/.test(s)) return "копия msgid";
  if (/wrong language|чужой язык|instead of|language gate/.test(s)) return "ЧУЖОЙ ЯЗЫК";
  if (/плейсхолдер|placeholder|теги/.test(s)) return "плейсхолдеры";
  if (/полн|complete|missing|обрыв/.test(s)) return "полнота";
  if (/register|стиль|natural|concis|тон/.test(s)) return "register/стиль";
  if (/gender|adjective|согласован|падеж|case/.test(s)) return "морфология";
  return "ПРОЧЕЕ";
}

let tot = 0;
const agg: Record<string, number> = {};

for (const lang of LANGS) {
  const ents = parsePo(readFileSync(`patches/ai-voice-pack/po/${lang}.po`, "utf-8").replace(/\r\n/g, "\n")).filter(
    (e) => e.msgid,
  );
  const rows = ents.filter((e) => CTX.has(e.msgctxt) && !e.msgstr.trim());
  if (!rows.length) continue;
  console.log(`\n=== ${lang}: ${rows.length} ===`);
  for (const e of rows) {
    const rec = lastRecord(lang, e.msgid);
    const b = rec ? bucket(rec.issues, rec.judge) : "нет записи в jsonl";
    agg[b] = (agg[b] ?? 0) + 1;
    tot++;
    console.log(`  [${b}] judge=${rec?.judge ?? "—"} | ctxt=${e.msgctxt}`);
    console.log(`      EN: ${e.msgid.slice(0, 88)}`);
    const iss = rec?.issues?.slice(0, 2) ?? [];
    if (iss.length) console.log(`      причина: ${iss.join(" // ").slice(0, 190)}`);
  }
}

console.log(`\n=== ИТОГО ${tot} ===`);
for (const [k, v] of Object.entries(agg).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
