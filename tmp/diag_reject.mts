// Диагностика: ПОЧЕМУ судья отказывает оставшиеся строки целевых срезов.
// Срез = арка Prologue ИЛИ ctxt menu/ui/speaker-name, msgstr пуст.
// Для каждой берём ПОСЛЕДНИЙ отказ в jsonl (т.е. после всех ретраев).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { loadPotIndex } from "../.opencode/skills/renpy-po/pot_resolve.mts";

const REPO = process.cwd();
const PO = join(REPO, "patches", "ai-voice-pack", "po");
const LANGS = ["de", "fr", "it", "pl", "pt", "ja", "ko", "zh", "ru", "es"];
const CTX = new Set(['"menu"', '"ui"', '"speaker-name"']);

const pot = loadPotIndex();
const arcOf = (ctxt: string, msgid: string): string | null => pot.resolve(ctxt.replace(/"/g, ""), msgid)?.arc ?? null;

interface Rej {
  issues: string[];
  judge: number;
  tries?: number;
}
/** Последний отказ по msgid (jsonl дописывается, последняя запись = свежайшая). */
function lastReject(lang: string, msgid: string): Rej | null {
  const f = join(REPO, "tmp", `po_translate_${lang}.jsonl`);
  if (!existsSync(f)) return null;
  const lines = readFileSync(f, "utf-8").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]) continue;
    try {
      const r = JSON.parse(lines[i]) as { msgid?: string; rejected?: boolean; issues?: string[]; judge?: number; tries?: number };
      if (r.msgid === msgid && r.rejected) return { issues: r.issues ?? [], judge: r.judge ?? -1, tries: r.tries };
    } catch {
      /* строка битая — пропускаем */
    }
  }
  return null;
}

/** Грубая классификация причины по тексту замечания. */
function bucket(issues: string[], judge: number): string {
  const s = issues.join(" | ").toLowerCase();
  if (judge === -1 && !issues.length) return "нет диагностики (judge=-1)";
  if (/msgstr == msgid|не переведено/.test(s)) return "копия msgid";
  if (/wrong language|чужой язык|испанск|instead of|language gate|не на том языке/.test(s)) return "ЧУЖОЙ ЯЗЫК";
  if (/плейсхолдер|placeholder|теги/.test(s)) return "плейсхолдеры";
  if (/adjective|dative|accusative|genitive|падеж|согласован|case agreement|gender|concord|brak zgody|odmian/.test(s))
    return "морфология/падежи";
  if (/register|реестр|регистр|tone|стиль|natural|unnatural|concis|стилист/.test(s)) return "register/стиль";
  if (/complete|полнот|missing|недоста|обрыв|truncat|omitted/.test(s)) return "полнота";
  if (/grammar|граммат|syntax|składni|conjuga|спряжен|блог/.test(s)) return "грамматика";
  return "ПРОЧЕЕ";
}

let grand = 0;
const totals: Record<string, number> = {};

for (const lang of LANGS) {
  const po = readFileSync(join(PO, `${lang}.po`), "utf-8");
  const ents = parsePo(po.replace(/\r\n/g, "\n")).filter((e) => e.msgid);
  const rows: { msgid: string; arc: string | null; ctx: string; rej: Rej | null }[] = [];
  for (const e of ents) {
    if (e.msgstr.trim()) continue;
    const inCtx = CTX.has(e.msgctxt);
    const arc = arcOf(e.msgctxt, e.msgid);
    if (!inCtx && arc !== "Prologue") continue;
    rows.push({ msgid: e.msgid, arc, ctx: e.msgctxt, rej: lastReject(lang, e.msgid) });
  }
  if (!rows.length) continue;

  console.log(`\n=== ${lang}: ${rows.length} осталось ===`);
  for (const r of rows) {
    const b = r.rej ? bucket(r.rej.issues, r.rej.judge) : "нет отказа в jsonl (ещё не пробовали)";
    totals[b] = (totals[b] ?? 0) + 1;
    grand++;
    const j = r.rej ? `judge=${r.rej.judge}` : "—";
    const t = r.rej?.tries ? ` tries=${r.rej.tries}` : "";
    console.log(`  [${b}] ${j}${t} | ${(r.arc ?? "-")}/${(r.ctx || "-").replace(/"/g, "")}`);
    console.log(`      EN: ${r.msgid.slice(0, 95)}`);
    const iss = r.rej?.issues?.slice(0, 3) ?? [];
    if (iss.length) console.log(`      причина: ${iss.join(" // ").slice(0, 200)}`);
  }
}

console.log(`\n=== ИТОГО ${grand} строк ===`);
console.log("по группам:");
for (const [k, v] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(3)}  ${k}`);
}
