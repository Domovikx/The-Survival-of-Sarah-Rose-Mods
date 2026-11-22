/**
 * stats.mts — ОДИН снимок чисел проекта: языки, перевод, озвучка, версия пака.
 *
 * Зачем. Числа («11 языков», «X из Y строк переведено/озвучено») живут в
 * нескольких местах: лендинг, установщик, меню мода, README, Steam-гайд. Если
 * каждый считает сам — они расходятся. Источник один: файлы на диске (`po/`,
 * `audio/`, `config/language-priority.json`); производные места либо берут
 * готовый артефакт, либо проверяются `--check`.
 *
 * Запуск (из корня репы):
 *   npm run stats:update          # напечатать + обновить config/stats.generated.json
 *   node scripts/stats.mts --no-write   # только напечатать
 *   npm run stats:check           # пересчитать и сравнить с файлом (CI/деплой)
 *
 * Не автоматизируется: числа внутри прозаических переводов сайта («11 языков»
 * в 11 локалях). Их список и порядок обновления — `docs/stats.md`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { countDone, plan as voicePlan } from "../patches/ai-voice-pack/tools/generate/scripts/voice_status.mts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "config", "stats.generated.json");
const PO_DIR = join(ROOT, "patches", "ai-voice-pack", "po");
const PRIORITY = join(ROOT, "config", "language-priority.json");
const SITE_PACK = join(ROOT, "site", "src", "shared", "config", "pack.ts");

export type LangStats = {
  /** Перевод: сколько строк заполнено и сколько всего. */
  po: { filled: number; total: number };
  /** Озвучка: сколько реплик записано и сколько в плане. */
  voice: { done: number; plan: number };
};

export type Stats = {
  updatedAt: string;
  /** Тег релиза, на который ссылается сайт (`PACK.tag`). */
  packTag: string;
  /** Порядок языков — из config/language-priority.json. */
  langs: string[];
  perLang: Record<string, LangStats>;
};

/** Тег пака из конфига сайта: единственное место, где он задан строкой. */
export const packTagFrom = (source: string): string => /tag:\s*"([^"]+)"/.exec(source)?.[1] ?? "";

const readJson = <T,>(path: string): T => JSON.parse(readFileSync(path, "utf-8")) as T;

/** Снимок по файлам на диске (единственный источник чисел). */
export const computeStats = (now = new Date()): Stats => {
  // Формат: { languages: [{rank, code, language, share}, …] } в порядке приоритета.
  const raw = readJson<{ languages?: Array<{ code: string }> } | string[]>(PRIORITY);
  const langs = Array.isArray(raw) ? raw : (raw.languages ?? []).map((l) => l.code);

  const perLang: Record<string, LangStats> = {};
  for (const lang of langs) {
    let po = { filled: 0, total: 0 };
    try {
      const entries = parsePo(readFileSync(join(PO_DIR, `${lang}.po`), "utf-8"));
      po = { filled: entries.filter((e) => e.msgstr.trim() !== "").length, total: entries.length };
    } catch {
      /* языка ещё нет — нули */
    }
    const planMap = voicePlan(lang);
    perLang[lang] = {
      po,
      voice: {
        done: countDone(lang).total,
        plan: [...planMap.values()].reduce((sum, n) => sum + n, 0),
      },
    };
  }

  return {
    updatedAt: now.toISOString(),
    packTag: packTagFrom(readFileSync(SITE_PACK, "utf-8")),
    langs,
    perLang,
  };
};

/** Снимки равны, если совпадают без даты (дата меняется каждый запуск). */
export const sameStats = (a: Stats, b: Stats): boolean =>
  JSON.stringify({ ...a, updatedAt: "" }) === JSON.stringify({ ...b, updatedAt: "" });

const main = (): number => {
  const args = new Set(process.argv.slice(2));
  const fresh = computeStats();

  if (args.has("--check")) {
    const old = readJson<Stats>(OUT);
    if (sameStats(old, fresh)) {
      console.log(`stats: ок (${fresh.packTag}, языков ${fresh.langs.length})`);
      return 0;
    }
    console.error("stats: снимок УСТАРЕЛ — `npm run stats:update`");
    for (const lang of fresh.langs) {
      const before = JSON.stringify(old.perLang[lang]);
      const after = JSON.stringify(fresh.perLang[lang]);
      if (before !== after) console.error(`  ${lang}: ${before} → ${after}`);
    }
    return 1;
  }

  const sum = (pick: (s: LangStats) => number): number =>
    fresh.langs.reduce((acc, lang) => acc + pick(fresh.perLang[lang]!), 0);
  console.log(`пак: ${fresh.packTag} · языков: ${fresh.langs.length}`);
  console.log(`перевод: ${sum((s) => s.po.filled)} строк (сумма по языкам)`);
  console.log(`озвучка: ${sum((s) => s.voice.done)} реплик (сумма по языкам)`);

  if (!args.has("--no-write")) {
    writeFileSync(OUT, `${JSON.stringify(fresh, null, 2)}\n`, "utf-8");
    console.log(`снимок: ${OUT}`);
  }
  return 0;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
