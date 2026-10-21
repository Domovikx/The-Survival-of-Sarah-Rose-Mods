/**
 * prefill.mts — разовая миграция готовых переводов tl/ru -> po/ru.po.
 *
 * Порт NeonTranslator prefill_po.py на TypeScript. Ничего не переводит:
 * перетаскивает существующие переводы из корпуса tl/ru (old/new-пары) в
 * PO-записи template.pot и ИЗМЕРЯЕТ миграцию:
 *
 *   - exact: EN-текст из POT есть в корпусе с ровно ОДНИМ вариантом RU.
 *     Контекстов в корпусе нет (tl-строки глобальны) — ctxt не участвует
 *     в ключе, один перевод легитимно покрывает все спикеры;
 *   - conflict: тот же EN-текст с РАЗНЫМИ RU в разных файлах — человек
 *     выбирает, записи остаются пустыми;
 *   - auto-normalized: точного текста нет, но normalizeText-твин
 *     ("004 Yeees ... 1") с ровно одним переводом наследует его
 *     (флаги fuzzy, auto-normalized; нормали из po/autofill_blocklist.txt
 *     в автозаполнение не идут — отказы человека священны);
 *   - missing: перевода нет нигде — очередь переводчика;
 *   - orphan: перевод из корпуса без записи в POT (не потерялся — tl
 *     остаётся источником, — но в PO не попадёт).
 *
 * Human-состояние священно: существующий msgstr БЕЗ флага auto-normalized
 * не пересчитывается (правило Neon). ru.po пишется без #. uid/emotion —
 * машинные метаданные живут только в template.pot.
 *
 * Запуск: npm run po:prefill  (или node .opencode/skills/renpy-po/prefill.mts)
 * Флаги:  --pot FILE --po FILE --tl DIR --blocklist FILE --report DIR
 *         --dry-run (не писать ru.po, только отчёты и сводку)
 * Выход:  po/ru.po + отчёты tmp/prefill_ru/*.tsv
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { normalizeText, parsePo, poUnescape, renderPo } from "./po_core.mts";
import type { PoEntry } from "./po_core.mts";
import { poHeaderLines } from "./po_update.mts";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SKILL_DIR, "..", "..", "..");
const PATCH_DIR = join(REPO_ROOT, "patches", "ai-voice-pack");
const PO_DIR = join(PATCH_DIR, "po");
const DEFAULT_POT = join(PO_DIR, "template.pot");
const DEFAULT_RU = join(PO_DIR, "ru.po");
const DEFAULT_TL = join(PATCH_DIR, "tl", "ru");
const DEFAULT_BLOCKLIST = join(PO_DIR, "autofill_blocklist.txt");
const DEFAULT_REPORT = join(REPO_ROOT, "tmp", "prefill_ru");

/** Corpus: old -> (new -> файлы-источники). */
export type RuMap = Map<string, Map<string, string[]>>;

export interface TlPair {
  old: string;
  new: string;
}

export interface PrefillStats {
  total: number; // записей POT (без заголовка)
  exact: number; // залито точным совпадением из корпуса
  humanKept: number; // существующий human-msgstr сохранён как есть
  autoNormalized: number; // залито по normalizeText-твину
  sameAsSource: number; // из них new == old (перевод-пасsthrough)
  conflicts: number; // записей POT с конфликтом вариантов
  conflictKeys: number; // уникальных текстов-конфликтов
  missing: number; // непереведённых (очередь переводчика)
  orphans: number; // RU из корпуса без записи в POT
}

export interface PrefillDetails {
  conflicts: Array<{ msgctxt: string; msgid: string; variants: string[] }>;
  normalized: Array<{ msgctxt: string; msgid: string; msgstr: string }>;
  missing: Array<{ msgctxt: string; msgid: string }>;
  orphans: Array<{ text: string; translations: string[] }>;
}

export interface PrefillResult {
  entries: PoEntry[]; // в порядке POT, без шапки
  stats: PrefillStats;
  details: PrefillDetails;
}

const entryKey = (e: { msgctxt: string; msgid: string }): string => `${e.msgctxt}\u0000${e.msgid}`;

const RE_OLD = /^\s*old\s+"(.*)"$/;
const RE_NEW = /^\s*new\s+"(.*)"$/;

/**
 * Разбирает .rpy-файл тла на пары old/new (обе ветки Ren'Py:
 * `translate ru strings:` и `translate ru <label>:` — у нас только strings).
 * Одиночные кавычки, экранирование PO-совместимое (poUnescape).
 * Аномалии (old без new, new без old, код между ними) считаются.
 */
export function parseTlPairs(text: string): { pairs: TlPair[]; anomalies: number } {
  const pairs: TlPair[] = [];
  let pending: string | null = null;
  let anomalies = 0;
  for (const raw of text.split("\n")) {
    const mo = RE_OLD.exec(raw);
    if (mo) {
      if (pending !== null) anomalies += 1; // old без new перед следующим old
      pending = poUnescape(mo[1]);
      continue;
    }
    const mn = RE_NEW.exec(raw);
    if (mn) {
      if (pending === null) {
        anomalies += 1; // new без old
        continue;
      }
      pairs.push({ old: pending, new: poUnescape(mn[1]) });
      pending = null;
      continue;
    }
    const t = raw.trim();
    if (!t || t.startsWith("#")) continue; // пустые и комменты пару не рвут
    if (pending !== null) {
      anomalies += 1; // код между old и new
      pending = null;
    }
  }
  if (pending !== null) anomalies += 1; // старый хвост в конце файла
  return { pairs, anomalies };
}

/** Дописывает пары в карту корпуса. Пустой new не считается переводом. */
export function addPairs(map: RuMap, pairs: TlPair[], file: string): number {
  let skipped = 0;
  for (const p of pairs) {
    if (!p.new) {
      skipped += 1;
      continue;
    }
    let variants = map.get(p.old);
    if (!variants) {
      variants = new Map();
      map.set(p.old, variants);
    }
    const files = variants.get(p.new);
    if (files) {
      if (!files.includes(file)) files.push(file);
    } else {
      variants.set(p.new, [file]);
    }
  }
  return skipped;
}

/** Нормали из блоклиста: строки без #, каждая — уже normalizeText-форма. */
export function loadBlocklist(text: string): Set<string> {
  const blocked = new Set<string>();
  for (const line of text.split("\n")) {
    const v = line.split("#", 1)[0].trim();
    if (v) blocked.add(v);
  }
  return blocked;
}

/**
 * Ядро prefill (порт prefill_po.build_ru_po). Ничего не пишет — только
 * считает и заполняет. Конфликт > точное > normalizeText-твин > missing.
 */
export function prefillRu(opts: {
  potText: string;
  ruMap: RuMap;
  blocked?: Set<string>;
  oldRuText?: string;
}): PrefillResult {
  const blocked = opts.blocked ?? new Set<string>();
  const potEntries = parsePo(opts.potText).filter((e) => e.msgid);

  const oldHuman = new Map<string, PoEntry>();
  if (opts.oldRuText) {
    for (const e of parsePo(opts.oldRuText)) {
      if (e.msgid) oldHuman.set(entryKey(e), e);
    }
  }

  // text -> отсортированные варианты RU; нормаль -> варианты RU (твины).
  const byText = new Map<string, string[]>();
  const byNorm = new Map<string, Set<string>>();
  for (const [text, variants] of opts.ruMap) {
    byText.set(text, [...variants.keys()].sort());
    const norm = normalizeText(text);
    let bucket = byNorm.get(norm);
    if (!bucket) {
      bucket = new Set();
      byNorm.set(norm, bucket);
    }
    for (const v of variants.keys()) bucket.add(v);
  }
  const byNormSorted = (norm: string): string[] => [...(byNorm.get(norm) ?? [])].sort();

  const potMsgids = new Set(potEntries.map((e) => e.msgid));
  const details: PrefillDetails = { conflicts: [], normalized: [], missing: [], orphans: [] };
  const stats: PrefillStats = {
    total: 0,
    exact: 0,
    humanKept: 0,
    autoNormalized: 0,
    sameAsSource: 0,
    conflicts: 0,
    conflictKeys: 0,
    missing: 0,
    orphans: 0,
  };
  const conflictKeySet = new Set<string>();

  const entries: PoEntry[] = [];
  for (const pe of potEntries) {
    stats.total += 1;
    const out: PoEntry = {
      msgid: pe.msgid,
      msgctxt: pe.msgctxt,
      msgstr: "",
      refs: [], // ru.po не наследует #:
      comments: [], // ru.po не наследует #. uid/emotion
      flags: [],
      translator: [],
    };
    const human = oldHuman.get(entryKey(pe));
    if (human?.msgstr && !human.flags.includes("auto-normalized")) {
      // Human (или прошлый точный прогон) священен — верbatim.
      out.msgstr = human.msgstr;
      out.flags = [...human.flags];
      out.translator = [...human.translator];
      stats.humanKept += 1;
    } else {
      const variants = byText.get(pe.msgid) ?? [];
      if (variants.length > 1) {
        stats.conflicts += 1;
        conflictKeySet.add(pe.msgid);
        details.conflicts.push({ msgctxt: pe.msgctxt, msgid: pe.msgid, variants });
      } else if (variants.length === 1) {
        out.msgstr = variants[0];
        stats.exact += 1;
        if (variants[0] === pe.msgid) stats.sameAsSource += 1;
      } else {
        const norm = normalizeText(pe.msgid);
        const normVars = byNormSorted(norm);
        if (normVars.length === 1 && !blocked.has(norm)) {
          out.msgstr = normVars[0];
          out.flags = ["fuzzy", "auto-normalized"];
          stats.autoNormalized += 1;
          details.normalized.push({ msgctxt: pe.msgctxt, msgid: pe.msgid, msgstr: normVars[0] });
        } else {
          stats.missing += 1;
          details.missing.push({ msgctxt: pe.msgctxt, msgid: pe.msgid });
        }
      }
    }
    entries.push(out);
  }

  stats.conflictKeys = conflictKeySet.size;
  for (const [text, variants] of opts.ruMap) {
    if (potMsgids.has(text)) continue;
    stats.orphans += 1;
    details.orphans.push({ text, translations: [...variants.keys()] });
  }
  return { entries, stats, details };
}

/** Рекурсивный список .rpy в каталоге тла. */
export function listRpy(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".rpy")) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

const tsvCell = (s: string): string => s.replace(/[\t\n\r]/g, " ");

function writeTsv(file: string, header: string, rows: string[][]): void {
  const body = [header, ...rows.map((r) => r.map(tsvCell).join("\t"))].join("\n");
  writeFileSync(file, body + "\n", "utf-8");
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      "Usage: node prefill.mts [--pot FILE] [--po FILE] [--tl DIR] [--blocklist FILE] [--report DIR] [--dry-run]",
    );
    return;
  }
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const potPath = flag("--pot") ?? DEFAULT_POT;
  const poPath = flag("--po") ?? DEFAULT_RU;
  const tlDir = flag("--tl") ?? DEFAULT_TL;
  const blocklistPath = flag("--blocklist") ?? DEFAULT_BLOCKLIST;
  const reportDir = flag("--report") ?? DEFAULT_REPORT;
  const dryRun = argv.includes("--dry-run");

  if (!existsSync(potPath)) {
    console.error(`ERROR: нет ${potPath} — сначала npm run potgen`);
    process.exit(1);
  }
  if (!existsSync(poPath)) {
    console.error(`ERROR: нет ${poPath} — файл бронируется заранее (заголовок с plural-формами)`);
    process.exit(1);
  }

  // Корпус tl/ru.
  const ruMap: RuMap = new Map();
  let pairCount = 0;
  let anomalies = 0;
  const files = listRpy(tlDir);
  for (const f of files) {
    const { pairs, anomalies: a } = parseTlPairs(readFileSync(f, "utf-8"));
    pairCount += pairs.length;
    anomalies += a;
    addPairs(ruMap, pairs, f.slice(tlDir.length + 1));
  }

  const potText = readFileSync(potPath, "utf-8");
  const oldRuText = readFileSync(poPath, "utf-8");
  const blocked = existsSync(blocklistPath) ? loadBlocklist(readFileSync(blocklistPath, "utf-8")) : new Set<string>();

  const { entries, stats, details } = prefillRu({ potText, ruMap, blocked, oldRuText });

  // Отчёты — в tmp/ (артефакты только в репе).
  mkdirSync(reportDir, { recursive: true });
  writeTsv(
    join(reportDir, "missing.tsv"),
    "msgctxt\tmsgid",
    details.missing.map((m) => [m.msgctxt, m.msgid]),
  );
  writeTsv(
    join(reportDir, "conflicts.tsv"),
    "msgctxt\tmsgid\tvariants",
    details.conflicts.map((c) => [c.msgctxt, c.msgid, c.variants.join(" ||| ")]),
  );
  writeTsv(
    join(reportDir, "normalized.tsv"),
    "msgctxt\tmsgid\tmsgstr",
    details.normalized.map((n) => [n.msgctxt, n.msgid, n.msgstr]),
  );
  writeTsv(
    join(reportDir, "orphans.tsv"),
    "text\ttranslations",
    details.orphans.map((o) => [o.text, o.translations.join(" ||| ")]),
  );

  if (!dryRun) {
    writeFileSync(poPath, renderPo(entries, poHeaderLines(oldRuText)), "utf-8");
  }

  const filled = stats.exact + stats.humanKept + stats.autoNormalized;
  const cov = ((100 * filled) / Math.max(stats.total, 1)).toFixed(1);
  const mode = dryRun ? " (dry-run, ru.po не записан)" : "";
  console.log(`${poPath}: ${filled}/${stats.total} = ${cov}% заполнено${mode}`);
  console.log(`  корпус: ${files.length} файлов, ${pairCount} пар old/new, аномалий парсинга: ${anomalies}`);
  console.log(`  точных совпадений: ${stats.exact} (из них new==old: ${stats.sameAsSource})`);
  console.log(`  normalizeText-твинов: ${stats.autoNormalized} (fuzzy, auto-normalized)`);
  console.log(`  human-сохранено: ${stats.humanKept}`);
  console.log(
    `  конфликтов: ${stats.conflicts} записей / ${stats.conflictKeys} текстов -> ${join(reportDir, "conflicts.tsv")}`,
  );
  console.log(`  непереведённых: ${stats.missing} -> ${join(reportDir, "missing.tsv")}`);
  console.log(`  сирот (RU без POT-записи): ${stats.orphans} -> ${join(reportDir, "orphans.tsv")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
