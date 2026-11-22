/**
 * stats.mts — ОДИН снимок чисел проекта: языки, перевод, озвучка, версия пака.
 *
 * Зачем. Числа («11 языков», «X из Y строк переведено/озвучено») живут в
 * нескольких местах: лендинг, установщик, меню мода, README, Steam-гайд. Если
 * каждый считает сам — они расходятся. Источник один: файлы на диске (`po/`,
 * `audio/`, `config/language-priority.json`); остальные места импортируют
 * готовый TS-модуль (`STATS`) — без JSON и парсинга.
 *
 * Запуск (из корня репы):
 *   npm run stats:update          # обновить config/stats.generated.ts
 *   npm run stats:check           # пересчитать и сравнить (CI/деплой)
 *   node scripts/stats.mts --no-write   # только напечатать
 *
 * Не автоматизируется: числа внутри прозаических переводов сайта («11 языков»
 * в 11 локалях). Их список и порядок обновления — `docs/stats.md`.
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { LangStats, Stats } from "../config/stats.types.ts";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { countDone, plan as voicePlan } from "../patches/ai-voice-pack/tools/generate/scripts/voice_status.mts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "config", "stats.generated.ts");
const PO_DIR = join(ROOT, "patches", "ai-voice-pack", "po");
const PRIORITY = join(ROOT, "config", "language-priority.json");
const SITE_PACK = join(ROOT, "site", "src", "shared", "config", "pack.ts");
const PO_INDEX = join(ROOT, "tmp", "po-index.json");

/** Индекс POT/PO, собранный Rust-ускорителем (`scripts/po_index.mts`). */
type PoStamp = { mtime: number; size: number };
type PoIndex = {
  pot: { entries: number; uid: string; stamp: PoStamp };
  po: Record<string, { entries: number; filled: number; stamp: PoStamp }>;
};

/**
 * Счётчики из индекса, ЕСЛИ он свежий: штамп (mtime+size) каждого PO должен
 * совпадать с файлом. Иначе null — и вызывающий считает сам (TS-оракул).
 */
export const fromIndex = (lang: string): { filled: number; total: number } | null => {
  try {
    const index = JSON.parse(readFileSync(PO_INDEX, "utf-8")) as PoIndex;
    const entry = index.po[lang];
    if (!entry) return null;
    const st = statSync(join(PO_DIR, `${lang}.po`));
    const fresh = entry.stamp.mtime === Math.floor(st.mtimeMs / 1000) && entry.stamp.size === st.size;
    return fresh ? { filled: entry.filled, total: entry.entries } : null;
  } catch {
    return null;
  }
};

const readJson = <T,>(path: string): T => JSON.parse(readFileSync(path, "utf-8")) as T;

/** Тег пака из конфига сайта: единственное место, где он задан строкой. */
export const packTagFrom = (source: string): string => /tag:\s*"([^"]+)"/.exec(source)?.[1] ?? "";

/** Снимок по файлам на диске (единственный источник чисел). */
export const computeStats = (now = new Date()): Stats => {
  // Формат: { languages: [{rank, code, language, share}, …] } в порядке приоритета.
  const raw = readJson<{ languages?: Array<{ code: string }> } | string[]>(PRIORITY);
  const langs = Array.isArray(raw) ? raw : (raw.languages ?? []).map((l) => l.code);

  const perLang: Record<string, LangStats> = {};
  for (const lang of langs) {
    let po = fromIndex(lang);
    if (!po) {
      po = { filled: 0, total: 0 };
      try {
        const entries = parsePo(readFileSync(join(PO_DIR, `${lang}.po`), "utf-8"));
        // Шапку файла (msgid "") не считаем строкой — как `countPo` в пульте:
        // иначе каждый po добавлял «+1 перевод» и числа расходились с индексом.
        po = {
          filled: entries.filter((e) => e.msgid.trim() !== "" && e.msgstr.trim() !== "").length,
          total: entries.filter((e) => e.msgid.trim() !== "").length,
        };
      } catch {
        /* языка ещё нет — нули */
      }
    }
    const planMap = voicePlan(lang);
    perLang[lang] = {
      po,
      voice: { done: countDone(lang).total, plan: [...planMap.values()].reduce((sum, n) => sum + n, 0) },
    };
  }

  return {
    updatedAt: now.toISOString(),
    packTag: packTagFrom(readFileSync(SITE_PACK, "utf-8")),
    langs,
    perLang,
  };
};

/**
 * Рендер снимка в TS-модуль: потребители просто делают
 * `import { STATS } from ".../stats.generated"` — без JSON.parse.
 */
export const renderStats = (stats: Stats): string => {
  const body = JSON.stringify(stats, null, 2)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")
    .trimStart();
  return `/**
 * СГЕНЕРИРОВАНО — руками не править.
 *
 * Источник: \`scripts/stats.mts\` (языки — config/language-priority.json,
 * перевод — po/<lang>.po, озвучка — audio/ + план POT, тег — site/.../pack.ts).
 * Перегенерация: \`npm run stats:update\`. Проверка: \`npm run stats:check\`.
 */
import type { Stats } from "./stats.types.ts";

export const STATS = ${body} as const satisfies Stats;

export type { LangStats, Stats } from "./stats.types.ts";
`;
};

const withoutDate = (text: string): string => text.replace(/^\s*"updatedAt": .*$/m, "");

const main = (): number => {
  const args = new Set(process.argv.slice(2));
  const fresh = computeStats();

  if (args.has("--check")) {
    let got = "";
    try {
      got = readFileSync(OUT, "utf-8");
    } catch {
      console.error("stats: файла снимка нет — `npm run stats:update`");
      return 1;
    }
    if (withoutDate(renderStats(fresh)) === withoutDate(got)) {
      console.log(`stats: ок (${fresh.packTag}, языков ${fresh.langs.length})`);
      return 0;
    }
    console.error("stats: снимок УСТАРЕЛ — `npm run stats:update`");
    return 1;
  }

  const sum = (pick: (s: LangStats) => number): number =>
    fresh.langs.reduce((acc, lang) => acc + pick(fresh.perLang[lang]!), 0);
  console.log(`пак: ${fresh.packTag} · языков: ${fresh.langs.length}`);
  console.log(`перевод: ${sum((s) => s.po.filled)} строк (сумма по языкам)`);
  console.log(`озвучка: ${sum((s) => s.voice.done)} реплик (сумма по языкам)`);

  if (!args.has("--no-write")) {
    writeFileSync(OUT, renderStats(fresh), "utf-8");
    console.log(`снимок: ${OUT}`);
  }
  return 0;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
