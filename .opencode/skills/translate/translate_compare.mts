#!/usr/bin/env node
/**
 * СОПОСТАВЛЕНИЕ ПЕРЕВОДОВ МЕЖДУ ЯЗЫКАМИ: где один язык расходится с остальными
 * по СТРУКТУРЕ (число предложений, цифры, теги), а не по длине.
 *
 * Зачем: «перевод есть» != «перевод согласован». Русский корпус прошёл отдельный
 * трёхслойный ремонт (2026-11-06), остальные языки — построчный прогон
 * Index-Translate-9B; если один язык системно добавляет/теряет фразы, это видно
 * по расхождению с МЕДИАНОЙ всех языков для той же реплики (EN — база).
 *
 * Две таблицы:
 *   ПОЛНЫЙ КОРПУС — все реплики, где у языка есть перевод (у языков разное
 *                   покрытие, сравнивать «в лоб» нельзя);
 *   ПЕРЕСЕЧЕНИЕ   — только реплики, переведённые ВСЕМИ языками (честное
 *                   сопоставление: одна и та же фраза во всех 10 языках).
 *
 * Метрики (про содержание, не про длину текста):
 *   пусто       — msgstr пустой (нет перевода);
 *   EN-остаток  — msgstr совпадает с msgid (английский не переведён);
 *   цифры≠EN    — набор чисел не совпадает с оригиналом;
 *   теги≠EN     — набор {..}/[..] не совпадает с оригиналом;
 *   предл≠EN    — число предложений не совпадает с оригиналом;
 *   предл≠БОЛЬШ — число предложений не совпадает с большинством языков этой же
 *                 реплики (медиана) — главный признак «язык сказал иначе».
 *
 * Read-only. Запуск из корня репы:
 *   node .opencode/skills/translate/translate_compare.mts [--examples 6]
 */
import { readFileSync } from "node:fs";

import { parsePo } from "../renpy-po/po_core.mts";

const PO_DIR = "patches/ai-voice-pack/po";
/** Порядок = language-priority.json (en первый как база). */
const LANGS = ["ru", "zh", "de", "es", "pt", "ja", "fr", "pl", "ko", "it"];

const examplesIdx = process.argv.indexOf("--examples");
const EXAMPLES = Number(examplesIdx > 0 ? process.argv[examplesIdx + 1] : 6);
/** --focus <lang>: чей язык разбирать подробно (по умолчанию — самый расходящийся). */
const focusIdx = process.argv.indexOf("--focus");
const FOCUS = focusIdx > 0 ? process.argv[focusIdx + 1] : null;

const key = (ctxt: string, id: string): string => `${ctxt}\u0000${id}`;
const tags = (s: string): string => (s.match(/\{[^}]+\}|\[[^\]]+\]/g) ?? []).toSorted().join("|");
const digits = (s: string): string => (s.match(/\d+/g) ?? []).toSorted().join(",");

/** Число предложений: точка/!/?/… и CJK-аналоги; «...»/«…» — один конец фразы. */
const sentences = (s: string): number => {
  const clean = s.replace(/\.{3,}|…/g, "…").replace(/\b(Mr|Mrs|Ms|Dr|St|vs|etc)\./gi, "$1");
  const parts = clean.split(/[.!?…。！？]+/).filter((p) => p.trim().length > 0);
  return Math.max(1, parts.length);
};
const median = (xs: number[]): number => {
  const s = xs.toSorted((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

const load = (lang: string): Map<string, string> => {
  const text = readFileSync(`${PO_DIR}/${lang}.po`, "utf-8").replace(/\r\n/g, "\n");
  const m = new Map<string, string>();
  for (const e of parsePo(text)) if (e.msgid) m.set(key(e.msgctxt, e.msgid), e.msgstr);
  return m;
};

const tpl = parsePo(readFileSync(`${PO_DIR}/template.pot`, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);
const maps = new Map<string, Map<string, string>>(LANGS.map((l) => [l, load(l)]));
const get = (lang: string, k: string): string => maps.get(lang)!.get(k) ?? "";

/** Реплики, переведённые всеми языками (и не оставленные по-английски). */
const common = tpl.filter((e) => {
  const k = key(e.msgctxt, e.msgid);
  return LANGS.every((l) => {
    const v = get(l, k);
    return v.length > 0 && v !== e.msgid;
  });
});

type Row = {
  lang: string;
  covered: number;
  empty: number;
  leftover: number;
  digits: number;
  tags: number;
  sentVsEn: number;
  sentVsMajority: number;
};
type Outlier = { ctxt: string; id: string; lang: string; got: number; majority: number; others: number[] };

function analyse(entries: typeof tpl, relative: boolean): { rows: Row[]; outliers: Outlier[] } {
  const rows: Row[] = LANGS.map((lang) => ({
    lang,
    covered: 0,
    empty: 0,
    leftover: 0,
    digits: 0,
    tags: 0,
    sentVsEn: 0,
    sentVsMajority: 0,
  }));
  const outliers: Outlier[] = [];
  const byLang = new Map(rows.map((r) => [r.lang, r]));

  for (const e of entries) {
    const k = key(e.msgctxt, e.msgid);
    const sEn = sentences(e.msgid);
    const counts = new Map<string, number>();
    for (const l of LANGS) {
      const v = get(l, k);
      if (v) counts.set(l, sentences(v));
    }
    const med = counts.size >= 4 ? median([...counts.values()]) : null;

    for (const lang of LANGS) {
      const row = byLang.get(lang)!;
      const v = get(lang, k);
      if (!v) {
        row.empty++;
        continue;
      }
      row.covered++;
      if (v === e.msgid) row.leftover++;
      if (digits(v) !== digits(e.msgid)) row.digits++;
      if (tags(v) !== tags(e.msgid)) row.tags++;
      const sLoc = sentences(v);
      if (sLoc !== sEn) row.sentVsEn++;
      if (med !== null && sLoc !== med) {
        row.sentVsMajority++;
        outliers.push({ ctxt: e.msgctxt, id: e.msgid, lang, got: sLoc, majority: med, others: [...counts.values()] });
      }
    }
  }
  if (relative) for (const r of rows) r.empty = entries.length - r.covered;
  return { rows, outliers };
}

const pad = (s: string | number, w: number) => String(s).padStart(w);
function table(title: string, entries: typeof tpl, rows: Row[]): { worst: Row; pct: (r: Row) => number } {
  console.log(`\n=== ${title} (реплик: ${entries.length})`);
  console.log("lang  переведено  пусто  EN-остаток  цифры≠EN  теги≠EN  предл≠EN  предл≠БОЛЬШ");
  for (const r of rows) {
    console.log(
      `${r.lang.padEnd(5)} ${pad(r.covered, 11)} ${pad(r.empty, 6)} ${pad(r.leftover, 11)} ${pad(r.digits, 9)} ${pad(r.tags, 8)} ${pad(
        r.sentVsEn,
        9,
      )} ${pad(r.sentVsMajority, 12)}`,
    );
  }
  const pct = (r: Row): number => (r.covered ? (r.sentVsMajority / r.covered) * 100 : 0);
  console.log(
    `Доля «сказано иначе, чем большинство»: ${rows.map((r) => `${r.lang} ${pct(r).toFixed(1)}%`).join(", ")}`,
  );
  const worst = rows.toSorted((a, b) => pct(b) - pct(a))[0];
  console.log(
    `Больше всех расходится: ${worst.lang} — ${worst.sentVsMajority} из ${worst.covered} (${pct(worst).toFixed(1)}%)`,
  );
  return { worst, pct };
}

const full = analyse(tpl, true);
table("ПОЛНЫЙ КОРПУС", tpl, full.rows);
const inter = analyse(common, false);
const found = table("ПЕРЕСЕЧЕНИЕ: реплики, переведённые всеми языками", common, inter.rows);

const lang = FOCUS ?? found.worst.lang;
const focused = inter.rows.find((r) => r.lang === lang)!;

// --names: имена персонажей по языкам (speaker-name) — где написание разъехалось.
if (process.argv.includes("--names")) {
  const names = tpl.filter((e) => e.msgctxt === "speaker-name");
  console.log(`\n=== ИМЕНА ПЕРСОНАЖЕЙ (speaker-name): ${names.length}`);
  for (const e of names) {
    const cells = LANGS.map((l) => get(l, key(e.msgctxt, e.msgid)) || "—");
    const uniq = new Set(cells);
    const mark = uniq.size === 1 ? " " : "*";
    console.log(`${mark} ${e.msgid.padEnd(24)} ${LANGS.map((l, i) => `${l}:${cells[i]}`).join("  ")}`);
  }
  process.exit(0);
}

// Твёрдые дефекты языка: непереведённый английский и потерянные числа.
const defects = (l: string): { leftover: string[]; nums: string[] } => {
  const leftover: string[] = [];
  const nums: string[] = [];
  for (const e of tpl) {
    const v = get(l, key(e.msgctxt, e.msgid));
    if (!v) continue;
    if (v === e.msgid) leftover.push(e.msgid);
    else if (digits(v) !== digits(e.msgid)) nums.push(`${e.msgid}\n      -> ${v}`);
  }
  return { leftover, nums };
};
const d = defects(lang);
console.log(
  `\n=== ДЕФЕКТЫ ${lang}: английский не переведён — ${d.leftover.length}, числа потеряны/изменены — ${d.nums.length}`,
);
for (const s of d.leftover.slice(0, 20)) console.log(`  [EN не переведён] ${s.replace(/\n/g, " / ")}`);
for (const s of d.nums.slice(0, 20)) console.log(`  [числа] ${s.replace(/\n/g, " / ")}`);

const mine = inter.outliers.filter((o) => o.lang === lang).slice(0, EXAMPLES);
const total = inter.outliers.filter((o) => o.lang === lang).length;
if (mine.length) {
  console.log(
    `\n=== РАСХОЖДЕНИЯ ${lang}: ${total} из ${focused.covered} (${found.pct(focused).toFixed(1)}%), показано ${mine.length}`,
  );
  for (const o of mine) {
    console.log(`\n[${o.got} предл. у ${lang}, медиана ${o.majority}] EN: ${o.id.replace(/\n/g, " / ")}`);
    for (const l of LANGS) {
      const v = get(l, key(o.ctxt, o.id)) || "<пусто>";
      console.log(`  ${l.toUpperCase()}: ${v.replace(/\n/g, " / ")}`);
    }
  }
}
