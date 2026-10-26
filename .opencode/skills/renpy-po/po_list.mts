/**
 * po_list.mts — выгрузка пар EN|TR из po/<lang>.po для ручной/агентской
 * проверки качества (см. скилл po-audit: аудитор смотрит «что было / как
 * перевели» и возвращает ошибки на перевод).
 *
 * Фильтры комбинируются: --arc Prologue --ctxt menu,ui даёт пролог-меню.
 *
 * Запуск:
 *   node po_list.mts --lang de --arc Prologue           # пролог языка
 *   node po_list.mts --lang de --ctxt menu,ui            # меню/интерфейс
 *   node po_list.mts --lang ru --limit 50 --empty        # первые 50 непереведённых
 *   node po_list.mts --lang es --json                    # JSON (для скриптов/агента)
 *
 * Выход: stdout блоками `[idx] msgctxt` / `EN:` / `TR:` (или JSON);
 * пустые msgstr помечаются как TR: <ПУСТО>.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parsePo } from "./po_core.mts";
import type { PoEntry } from "./po_core.mts";
import { loadPotIndex } from "./pot_resolve.mts";
import { ALL_LANGS } from "./po_translate.mts";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SKILL_DIR, "..", "..", "..");
const PO_DIR = join(REPO_ROOT, "patches", "ai-voice-pack", "po");

interface O {
  lang: string;
  arc: string;
  ctxt: string;
  limit: number;
  empty: boolean;
  json: boolean;
}

function parseCli(argv: string[]): O {
  const o: O = { lang: "", arc: "", ctxt: "", limit: 0, empty: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--lang") o.lang = argv[++i] || "";
    else if (a === "--arc") o.arc = argv[++i] || "";
    else if (a === "--ctxt") o.ctxt = argv[++i] || "";
    else if (a === "--limit") o.limit = Number(argv[++i]) || 0;
    else if (a === "--empty") o.empty = true;
    else if (a === "--json") o.json = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node po_list.mts --lang <code> [--arc <Arc>] [--ctxt a,b] [--limit N] [--empty] [--json]\n" +
          `Языки: ${ALL_LANGS.join(", ")}`,
      );
      process.exit(0);
    }
  }
  if (!o.lang || !ALL_LANGS.includes(o.lang)) {
    console.error(`Нужен --lang из: ${ALL_LANGS.join(", ")}`);
    process.exit(1);
  }
  return o;
}

function main(): void {
  const o = parseCli(process.argv.slice(2));
  const poPath = join(PO_DIR, `${o.lang}.po`);
  if (!existsSync(poPath)) {
    console.error(`Нет файла: ${poPath}`);
    process.exit(1);
  }
  const entries = parsePo(readFileSync(poPath, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);
  const pot = o.arc ? loadPotIndex() : null;
  const ctxtList = o.ctxt
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  type Row = { idx: number; ctxt: string; arc: string; msgid: string; msgstr: string };
  const rows: Row[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e: PoEntry = entries[i];
    if (ctxtList.length && !ctxtList.includes(e.msgctxt)) continue;
    const arc = pot ? (pot.resolve(e.msgctxt, e.msgid)?.arc ?? "_unknown") : "";
    if (o.arc && arc !== o.arc) continue;
    if (o.empty && e.msgstr.trim()) continue;
    rows.push({ idx: i, ctxt: e.msgctxt, arc, msgid: e.msgid, msgstr: e.msgstr });
    if (o.limit && rows.length >= o.limit) break;
  }

  if (o.json) {
    console.log(JSON.stringify({ lang: o.lang, arc: o.arc, ctxt: o.ctxt, count: rows.length, rows }, null, 1));
    return;
  }
  console.log(`# ${o.lang}.po | арк=${o.arc || "все"} | ctxt=${o.ctxt || "все"} | записей ${rows.length}`);
  for (const r of rows) {
    console.log(`[${r.idx}] ${r.ctxt}${r.arc ? ` arc=${r.arc}` : ""}`);
    console.log(`EN: ${r.msgid}`);
    console.log(`TR: ${r.msgstr.trim() || "<ПУСТО>"}`);
    console.log("");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
