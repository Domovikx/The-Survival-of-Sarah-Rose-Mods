/**
 * po_audit.mts — аудитор переводов po/: находит «в чём лажа» в УЖЕ
 * переведённом, показывает EN vs TR и умеет чинить.
 *
 * Идея владельца (2026-10-25): отдельный скилл-аудитор (po-audit) с главной
 * целью — найти проблемы в готовых переводах, показать оригинал и перевод
 * рядом, а при ошибке ВЕРНУТЬ запись на перевод (msgstr="" → очередь
 * po:translate). Планируется запуск сабагентом поверх прогонов.
 *
 * Классы (все завязаны на шлюз/авточеки po_translate.mts — источник один):
 *   A  символьный msgid ≠ идентичность — галлюцинация модели по контексту
 *      (`<` → `<A Brief Investigation on Ethics>`);  fix: msgstr = msgid
 *   C  чужая письменность — кириллица в латинских языках, CJK в ru и т.д.
 *      (pl `Thomas`→`Томас`, es `retuercе` — кириллица внутри слова);
 *      fix: msgstr = "" (возврат на перевод)
 *   D  короткий UI-msgid → длинный перевод — галлюцинация по контексту
 *      (es `Load` → фраза про «Carga la mercancía»);
 *      fix: msgstr = "" (возврат на перевод)
 *   B  msgstr == msgid с буквами — ТОЛЬКО отчёт (ru `Ctrl`, `Enter`,
 *      `Page Down` — это и есть перевод; автоматом не трогаем)
 *
 * Запуск:
 *   node po_audit.mts                     # отчёт по всем 10 языкам
 *   node po_audit.mts --lang es           # один язык
 *   node po_audit.mts --fix               # применить: A -> идентичность,
 *                                          #   C/D -> пустой (на перевод)
 *   node po_audit.mts --json              # отчёт JSON (для скилла/сабагента)
 *
 * Выход: stdout (человек) или JSON; --fix перезаписывает po-файлы на месте
 * (round-trip через renderPo проверен байт-в-байт для всех 10 языков).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parsePo, renderPo } from "./po_core.mts";
import type { PoEntry } from "./po_core.mts";
import { poHeaderLines } from "./po_update.mts";
import { ALL_LANGS, foreignScriptIssue, isSymbolicMsgid, shortToLongIssue } from "./po_translate.mts";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SKILL_DIR, "..", "..", "..");
const PO_DIR = join(REPO_ROOT, "patches", "ai-voice-pack", "po");

/** Одна найденная аномалия. */
export interface Anomaly {
  lang: string;
  /** A | B | C | D */
  cls: "A" | "B" | "C" | "D";
  /** Человекочитаемая причина (из авточека po_translate). */
  why: string;
  msgctxt: string;
  msgid: string;
  msgstr: string;
  /** Что делает --fix с записью. */
  action: "ident" | "retranslate" | "report-only";
}

/** Разбор одной записи языка → аномалии (или ничего). */
export function auditEntry(lang: string, e: PoEntry): Anomaly[] {
  if (!e.msgid.trim() || !e.msgstr.trim()) return [];
  const mid = e.msgid;
  const tr = e.msgstr;
  const base = { lang, msgctxt: e.msgctxt, msgid: mid, msgstr: tr };
  // A: символьный msgid, но перевод не идентичность
  if (isSymbolicMsgid(mid)) {
    if (tr.trim() !== mid.trim()) {
      return [{ ...base, cls: "A", why: "символьный msgid → галлюцинация", action: "ident" }];
    }
    return [];
  }
  // B: копия msgid с буквами (для ru расширений — норма, только отчёт)
  if (tr.trim() === mid.trim()) {
    return [{ ...base, cls: "B", why: "msgstr == msgid (возможно, подлежит переводу)", action: "report-only" }];
  }
  const out: Anomaly[] = [];
  // C: чужая письменность
  const fsIssue = foreignScriptIssue(lang, tr);
  if (fsIssue) out.push({ ...base, cls: "C", why: fsIssue, action: "retranslate" });
  // D: короткий UI → длинный бред
  const slIssue = shortToLongIssue(mid, tr);
  if (slIssue) out.push({ ...base, cls: "D", why: slIssue, action: "retranslate" });
  return out;
}

/** Аудит одного языка: все аномалии по файлу. */
export function auditLang(lang: string): Anomaly[] {
  const poPath = join(PO_DIR, `${lang}.po`);
  if (!existsSync(poPath)) return [];
  const text = readFileSync(poPath, "utf-8").replace(/\r\n/g, "\n");
  const out: Anomaly[] = [];
  for (const e of parsePo(text)) out.push(...auditEntry(lang, e));
  return out;
}

/**
 * Применение фикса: A → идентичность, C/D → пустой msgstr (возврат в
 * очередь po:translate). B не трогаем. Возвращает число изменённых записей.
 */
export function applyFix(lang: string, anoms: Anomaly[]): number {
  const poPath = join(PO_DIR, `${lang}.po`);
  const text = readFileSync(poPath, "utf-8").replace(/\r\n/g, "\n");
  const header = poHeaderLines(text);
  const entries = parsePo(text);
  const byId = new Map<string, Anomaly>();
  for (const a of anoms) if (a.action !== "report-only") byId.set(`${a.msgctxt} ${a.msgid}`, a);
  let n = 0;
  for (const e of entries) {
    const a = byId.get(`${e.msgctxt} ${e.msgid}`);
    if (!a) continue;
    if (a.action === "ident") e.msgstr = e.msgid;
    else e.msgstr = "";
    n++;
  }
  if (n) writeFileSync(poPath, renderPo(entries, header), "utf-8");
  return n;
}

function parseCli(argv: string[]): { lang: string; fix: boolean; json: boolean } {
  const o = { lang: "", fix: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--lang") o.lang = argv[++i] || "";
    else if (a === "--fix") o.fix = true;
    else if (a === "--json") o.json = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node po_audit.mts [--lang <code>] [--fix] [--json]\n" +
          "  --lang   один язык (по умолчанию все 10)\n" +
          "  --fix    применить: A -> идентичность, C/D -> пустой (на перевод)\n" +
          "  --json   отчёт JSON (для скилла po-audit/сабагента)",
      );
      process.exit(0);
    }
  }
  return o;
}

function main(): void {
  const o = parseCli(process.argv.slice(2));
  const langs = o.lang ? [o.lang] : ALL_LANGS;
  for (const l of langs) {
    if (!ALL_LANGS.includes(l)) {
      console.error(`Неизвестный язык "${l}". Доступные: ${ALL_LANGS.join(", ")}.`);
      process.exit(1);
    }
  }
  const all: Anomaly[] = [];
  for (const l of langs) all.push(...auditLang(l));

  if (o.json) {
    console.log(JSON.stringify({ langs, total: all.length, anomalies: all }, null, 2));
    if (o.fix) {
      let n = 0;
      for (const l of langs) {
        const mine = all.filter((a) => a.lang === l);
        if (mine.length) n += applyFix(l, mine);
      }
      console.error(`--fix: изменено записей ${n}`);
    }
    return;
  }

  const byCls = new Map<string, number>();
  for (const a of all) byCls.set(a.cls, (byCls.get(a.cls) ?? 0) + 1);
  if (!all.length) {
    console.log(`аудит ${langs.length} языков: аномалий НЕТ`);
  } else {
    console.log(`=== ПОИСК "В ЧЁМ ЛАЖА" (${langs.length} языков) ===`);
    for (const cls of ["A", "B", "C", "D"] as const) {
      const n = byCls.get(cls) ?? 0;
      if (n) console.log(`  ${cls}: ${n}`);
    }
    for (const a of all) {
      console.log(`\n${a.lang} [${a.cls}] ${a.why}  (-> ${a.action})`);
      console.log(`   ctxt: ${a.msgctxt}`);
      console.log(`   EN:   ${a.msgid.slice(0, 120)}`);
      console.log(`   TR:   ${a.msgstr.slice(0, 160)}`);
    }
  }
  if (o.fix) {
    let n = 0;
    for (const l of langs) {
      const mine = all.filter((a) => a.lang === l);
      if (mine.length) n += applyFix(l, mine);
    }
    console.log(`\n--fix: изменено записей ${n} (A -> идентичность, C/D -> пусто на перевод)`);
  } else if (all.length) {
    console.log(`\n(запусти с --fix, чтобы применить: A -> идентичность, C/D -> возврат на перевод)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
