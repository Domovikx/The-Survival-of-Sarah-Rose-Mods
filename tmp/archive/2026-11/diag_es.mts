// Диагностика остатка es (349): почему судья отказывает.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { loadPotIndex } from "../.opencode/skills/renpy-po/pot_resolve.mts";

const REPO = process.cwd();
loadPotIndex();

function lastRecord(msgid: string): { issues: string[]; judge: number } | null {
  const f = join(REPO, "tmp", "po_translate_es.jsonl");
  if (!existsSync(f)) return null;
  const lines = readFileSync(f, "utf-8").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]) continue;
    try {
      const r = JSON.parse(lines[i]) as { msgid?: string; rejected?: boolean; issues?: string[]; judge?: number };
      if (r.msgid === msgid && r.rejected) return { issues: r.issues ?? [], judge: r.judge ?? -1 };
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
  if (/wrong language|чужой язык|instead of|language gate|не на том/.test(s)) return "ЧУЖОЙ ЯЗЫК";
  if (/плейсхолдер|placeholder|теги/.test(s)) return "плейсхолдеры";
  if (/полн|complete|missing|обрыв|truncat/.test(s)) return "полнота";
  if (/register|реестр|стиль|natural|concis|тон/.test(s)) return "register/стиль";
  if (/gender|adjective|согласован|падеж|case agreement|concord/.test(s)) return "морфология";
  if (/клиническ|clinical/.test(s)) return "клинический лексикон";
  if (/grammar|граммат|syntax|gramatical|блог/.test(s)) return "грамматика";
  return "ПРОЧЕЕ";
}

const ents = parsePo(readFileSync("patches/ai-voice-pack/po/es.po", "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid,
);
const empty = ents.filter((e) => !e.msgstr.trim());

const agg: Record<string, number> = {};
const judgeB: Record<string, number> = {};
let noRec = 0;
let sumJudge = 0;
let nJudge = 0;

for (const e of empty) {
  const rec = lastRecord(e.msgid);
  if (!rec) {
    noRec++;
    agg["нет записи в jsonl"] = (agg["нет записи в jsonl"] ?? 0) + 1;
    continue;
  }
  const b = bucket(rec.issues, rec.judge);
  agg[b] = (agg[b] ?? 0) + 1;
  const j = rec.judge;
  const jb = j === -1 ? "авточек(-1)" : j < 7 ? "судья 0-6" : j < 9 ? "судья 7-8" : "судья 9+";
  judgeB[jb] = (judgeB[jb] ?? 0) + 1;
  sumJudge += j;
  nJudge++;
}

console.log(`всего пустых es: ${empty.length}`);
console.log(`без записи об отказе: ${noRec}`);
console.log(`\nпо причинам:`);
for (const [k, v] of Object.entries(agg).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log(`\nпо баллам:`);
for (const [k, v] of Object.entries(judgeB).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log(`\nсредний балл судьи: ${nJudge ? (sumJudge / nJudge).toFixed(2) : "-"}`);

// примеры ПРОЧЕЕ и ЧУЖОЙ ЯЗЫК — чтобы понять природу
console.log("\n=== примеры «ПРОЧЕЕ» (первые 8) ===");
let n = 0;
for (const e of empty) {
  if (n >= 8) break;
  const rec = lastRecord(e.msgid);
  if (!rec || bucket(rec.issues, rec.judge) !== "ПРОЧЕЕ") continue;
  n++;
  console.log(`  judge=${rec.judge} | ${e.msgctxt}`);
  console.log(`    EN: ${e.msgid.slice(0, 90)}`);
  console.log(`    причина: ${rec.issues.join(" // ").slice(0, 180)}`);
}
