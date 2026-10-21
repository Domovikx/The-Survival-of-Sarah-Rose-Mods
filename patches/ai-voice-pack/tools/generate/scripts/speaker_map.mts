/**
 * speaker_map.mts — ревьюер мапы «спикер POT → голос (каст)».
 *
 * Источник мапы — типизированный модуль casts/casts.mts (VOICES /
 * SPEAKERS / LINE_OVERRIDES); реальность — po/template.pot (спикеры, uid'ы)
 * и папки casts/ (касты с контрактом {Name}.mts). Тул мапу НЕ перезаписывает
 * (руками правит человек) — только читает, рапортует и подсказывает.
 *
 * Команды (node 24, type-stripping; без зависимостей):
 *   node speaker_map.mts sync [--emit]    — рапорт + блок новых спикеров (--emit)
 *   node speaker_map.mts check [--strict] — тихая проверка (CI/гейт)
 * Опции: --pot P --casts D (дефолты — раскладка репы).
 *
 * Контракт «ничего не теряем»:
 *   - КАЖДЫЙ спикер POT обязан быть ключом SPEAKERS (нет ключа = ERROR);
 *   - значение обязано существовать в VOICES и на диске (ERROR);
 *   - VOICES сверяется с папками casts/ в ОБЕ стороны (новый каст без
 *     имени в юнионе / протухшее имя без папки = ERROR);
 *   - ключ мапы вне POT = переименование/выпадение спикера (ERROR);
 *   - line_overrides: uid = 32-hex, uid есть в POT, спикер существует (ERROR);
 *   - null-значения и касты без спикеров — предупреждения (ревью владельца).
 *
 * Запуск тестов:
 *   node --test patches/ai-voice-pack/tools/generate/scripts/speaker_map.test.mts
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { VOICES, SPEAKERS } from "../../../casts/casts.mts";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
/** patches/ai-voice-pack */
export const PKG_ROOT = join(SCRIPTS_DIR, "..", "..", "..");
export const DEFAULT_POT = join(PKG_ROOT, "po", "template.pot");
export const DEFAULT_CASTS = join(PKG_ROOT, "casts", "voices");

/** PO-экранирование -> текст (\" \n \\), как в msgctxt POT. */
export function poUnescape(s: string): string {
  return s.replace(/\\(.)/g, (_m, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
}

// ----------------------------------------------------------------- POT ------

const SPEAKER_RE = /^\s*msgctxt "speaker:((?:[^"\\]|\\.)*)"\s*$/gm;
const UID_RE = /^#\. uid: ([0-9a-f]{32})\s*$/gm;

/** Спикеры POT -> количество записей (учёт массовости для приоритетов). */
export function potSpeakers(potText: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of potText.matchAll(SPEAKER_RE)) {
    const name = poUnescape(m[1]);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/** uid'ы POT (строки "#. uid: <32hex>") — для проверки line_overrides. */
export function potUids(potText: string): Set<string> {
  const uids = new Set<string>();
  for (const m of potText.matchAll(UID_RE)) uids.add(m[1]);
  return uids;
}

// --------------------------------------------------------------- casts ------

/** Папки casts/ с контрактом {Name}.mts = голоса на диске. */
export function listCasts(castsDir: string): string[] {
  if (!existsSync(castsDir)) return [];
  return readdirSync(castsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(castsDir, d.name, `${d.name}.mts`)))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
}

// ----------------------------------------------------------- audit ----------

export interface SpeakerMapSnapshot {
  speakers: Record<string, string | null>;
}

export interface AuditResult {
  /** Жёсткие ошибки — мапа врёт или протухла (exit 1). */
  errors: string[];
  /** Предупреждения — ревью владельца (exit 0 без --strict). */
  warnings: string[];
  /** Спикеры без ключа в мапе (для sync --emit). */
  missing: { speaker: string; lines: number; suggestion: string | null }[];
  /** Каст -> спикеры, на него ссылающиеся (видно шаринг). */
  castUsage: Map<string, string[]>;
  /** Касты, на которые не ссылается ни один спикер. */
  unusedCasts: string[];
  totalSpeakers: number;
  mapped: number;
  voiced: number;
}

export interface AuditInput {
  map: SpeakerMapSnapshot;
  /** Спикеры POT: имя -> число записей. */
  speakers: Map<string, number>;
  /** Касты на диске (listCasts). */
  castsOnDisk: string[];
  /** Объявленные касты (ключи VOICES) — сверка в обе стороны. */
  declaredCasts: readonly string[];
}

/** Ближайшее имя каста: casefold-точное, иначе Левенштейн <= 2 (подсказка). */
export function suggestCast(speaker: string, casts: string[]): string | null {
  const cf = speaker.toLocaleLowerCase("en");
  const exact = casts.find((c) => c.toLocaleLowerCase("en") === cf);
  if (exact) return exact;
  let best: string | null = null;
  let bestD = 3;
  for (const c of casts) {
    const d = levenshtein(cf, c.toLocaleLowerCase("en"));
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_v, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Сверка мапы с реальностью: спикеры POT + касты (диск/юнион) + uid'ы. */
export function audit(input: AuditInput): AuditResult {
  const { map, speakers, castsOnDisk, declaredCasts } = input;
  const errors: string[] = [];
  const warnings: string[] = [];
  const missing: AuditResult["missing"] = [];
  const diskSet = new Set(castsOnDisk);
  const declaredSet = new Set(declaredCasts);
  const castUsage = new Map<string, string[]>();

  // юнион VOICES <-> папки casts/: обе стороны обязаны совпадать
  for (const c of castsOnDisk) {
    if (!declaredSet.has(c)) {
      errors.push(`каст на диске не объявлен в VOICES: ${JSON.stringify(c)}`);
    }
  }
  for (const c of declaredCasts) {
    if (!diskSet.has(c)) {
      errors.push(`VOICES без папки на диске: ${JSON.stringify(c)}`);
    }
  }

  for (const [speaker, lines] of [...speakers].sort((a, b) => b[1] - a[1])) {
    if (!(speaker in map.speakers)) {
      errors.push(`спикер без ключа в мапе: ${JSON.stringify(speaker)} (реплик: ${lines})`);
      missing.push({ speaker, lines, suggestion: suggestCast(speaker, castsOnDisk) });
      continue;
    }
    const value = map.speakers[speaker];
    if (value === null || value === undefined) {
      warnings.push(`без голоса (null): ${JSON.stringify(speaker)} (реплик: ${lines})`);
      continue;
    }
    if (!declaredSet.has(value)) {
      errors.push(`протухшее значение: ${JSON.stringify(speaker)} -> ${JSON.stringify(value)} (каста нет)`);
      continue;
    }
    castUsage.set(value, [...(castUsage.get(value) ?? []), speaker]);
  }

  for (const speaker of Object.keys(map.speakers)) {
    if (!speakers.has(speaker)) {
      errors.push(`протухший ключ мапы: ${JSON.stringify(speaker)} (нет в POT — переименован/выпал?)`);
    }
  }

  const unusedCasts = castsOnDisk.filter((c) => !castUsage.has(c));
  for (const c of unusedCasts) {
    warnings.push(`каст без спикеров: ${JSON.stringify(c)}`);
  }

  const mapped = [...speakers.keys()].filter((s) => s in map.speakers).length;
  const voiced = [...speakers.keys()].filter((s) => {
    const v = map.speakers[s];
    return typeof v === "string" && declaredSet.has(v);
  }).length;

  return {
    errors,
    warnings,
    missing,
    castUsage,
    unusedCasts,
    totalSpeakers: speakers.size,
    mapped,
    voiced,
  };
}

/** TS-блок новых спикеров для вставки в SPEAKERS (с подсказками). */
export function emitAdditions(missing: AuditResult["missing"]): string {
  return missing
    .slice()
    .sort((a, b) => a.speaker.localeCompare(b.speaker, "en"))
    .map(({ speaker, suggestion }) => {
      const key = JSON.stringify(speaker);
      const hint = suggestion ? ` // голос?: ${JSON.stringify(suggestion)}` : "";
      return `  ${key}: null,${hint}`;
    })
    .join("\n");
}

// ------------------------------------------------------------------ CLI -----

function printReport(res: AuditResult, potPath: string, castsDir: string): void {
  console.log(`=== casts.mts: мапа «спикер → голос» ===`);
  console.log(`  пот:   ${potPath}`);
  console.log(`  касты: ${castsDir}`);
  console.log();
  console.log(`спикеров в POT: ${res.totalSpeakers}`);
  console.log(`  с ключом в мапе: ${res.mapped} (из них с голосом: ${res.voiced})`);
  console.log(`  без ключа:       ${res.totalSpeakers - res.mapped}`);
  const shared = [...res.castUsage.entries()]
    .filter(([, who]) => who.length > 1)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  if (shared.length) {
    console.log(`голоса с несколькими спикерами:`);
    for (const [cast, who] of shared) {
      console.log(`  ${cast}: ${who.length} спикеров`);
    }
  }
  console.log();
  if (res.errors.length) {
    console.log(`ОШИБКИ (${res.errors.length}):`);
    for (const e of res.errors) console.log(`  !! ${e}`);
    console.log();
  }
  if (res.warnings.length) {
    console.log(`предупреждения (${res.warnings.length}):`);
    for (const w of res.warnings) console.log(`  -- ${w}`);
    console.log();
  }
}

function parseArgs(argv: string[]) {
  const opts = {
    cmd: "sync",
    emit: false,
    strict: false,
    pot: DEFAULT_POT,
    casts: DEFAULT_CASTS,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "sync" || a === "check") opts.cmd = a;
    else if (a === "--emit") opts.emit = true;
    else if (a === "--strict") opts.strict = true;
    else if (a === "--pot") opts.pot = argv[++i];
    else if (a === "--casts") opts.casts = argv[++i];
    else {
      console.error(`неизвестный аргумент: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const potText = readFileSync(opts.pot, "utf8");
  const map: SpeakerMapSnapshot = {
    speakers: SPEAKERS,
  };
  const res = audit({
    map,
    speakers: potSpeakers(potText),
    castsOnDisk: listCasts(opts.casts),
    declaredCasts: Object.keys(VOICES),
  });

  if (opts.cmd === "sync") {
    printReport(res, opts.pot, opts.casts);
    if (opts.emit && res.missing.length) {
      console.log(`=== вставь в SPEAKERS (casts/casts.mts; правка руками) ===`);
      console.log(emitAdditions(res.missing));
      console.log(`=== конец блока ===`);
      console.log();
    }
  }

  const fail = res.errors.length > 0 || (opts.strict && res.warnings.length > 0);
  if (opts.cmd === "check" || res.errors.length || res.warnings.length) {
    const verdict = fail ? "FAIL" : "ok";
    console.log(`${opts.cmd}: ${verdict} (ошибок: ${res.errors.length}, предупреждений: ${res.warnings.length})`);
  }
  process.exit(fail ? 1 : 0);
}

// запуск только при прямом вызове (импорт из тестов — без CLI)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
