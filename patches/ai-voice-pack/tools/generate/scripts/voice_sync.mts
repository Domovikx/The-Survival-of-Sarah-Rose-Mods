/**
 * voice_sync.mts — актуализатор voice-структуры: status / update.
 *
 * Порт python voice_sync.py (2026-10-22; python-оркестраторы выпищены).
 * Слои-источники правды:
 *   casts/voices.mts (VOICES)  подключённые голоса (озвучен = активный реф)
 *   casts/casts.mts (SPEAKERS) мапа «спикер -> каст»
 *   casts/voices/{Имя}/        папки: контракт {Имя}.mts + реф + generated/
 *
 * КОМАНДЫ:
 *   status                 сводка слоёв и расхождений (console)
 *   update [--apply]       создать папку+контракт-заглушку новым кастам
 *
 * Удалены как легаси (2026-10-22): migrate (одноразовый переезд уже сделан),
 * report (*.md-отчёты выпищены), журнал voices.jsonl (источник — POT).
 *
 * ПРАВИЛА: ничего не удалять и не перетирать; без --apply только план;
 * рефы НЕ создаются автоматически — только структура.
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { CASTS_DIR } from "./add_candidate.mts";
import { SPEAKERS } from "../../../casts/casts.mts";
import { VOICES } from "../../../casts/voices.mts";

/** Голоса-заглушки «Generic ...» — не касты, структура им не создаётся. */
export const SKIP_CAST_NAMES = new Set([
  "Generic Female Mature",
  "Generic Female Young",
  "Generic Male Mature",
  "Generic Male Young",
]);

export interface CastLayer {
  name: string;
  dir: boolean;
  /** контракт {Имя}.mts на месте. */
  contract: boolean;
  /** подключён в VOICES (значение непустое). */
  wired: boolean;
  /** активный реф-файл существует. */
  ref: boolean;
  variants: number;
  generated: number;
}

/** Имя экспорта контракта: "Captain Belmont" -> CaptainBelmont (как cast_mts). */
export function contractIdent(name: string): string {
  return name.replace(/[^\p{L}\d]/gu, "");
}

/** Сводка слоёв по всем кастам (реестр = VOICES ∪ папки casts/voices/). */
export function castLayers(
  voices: Record<string, string | null> = VOICES as Record<string, string | null>,
  baseDir: string = CASTS_DIR,
): CastLayer[] {
  const names = new Set<string>(Object.keys(voices));
  if (existsSync(baseDir)) {
    for (const f of readdirSync(baseDir)) {
      if (existsSync(join(baseDir, f))) names.add(f);
    }
  }
  return [...names].sort().map((name) => {
    const dir = join(baseDir, name);
    const d = existsSync(dir);
    const count = (sub: string): number => {
      const sd = join(dir, sub);
      return existsSync(sd) ? readdirSync(sd).filter((f) => f.endsWith(".mp3")).length : 0;
    };
    return {
      name,
      dir: d,
      contract: d && existsSync(join(dir, `${name}.mts`)),
      wired: !!voices[name],
      ref: d && existsSync(join(dir, `${name}.wav`)),
      variants: d ? readdirSync(dir).filter((f) => f.endsWith(".wav") && f.startsWith(`${name}_`)).length : 0,
      generated: count("generated"),
    };
  });
}

export interface SyncReport {
  layers: CastLayer[];
  /** подключён в VOICES, но реф-файл отсутствует. */
  wiredNoRef: string[];
  /** реф на месте, но не подключён в VOICES. */
  refNotWired: string[];
  /** папка есть, но каста нет в реестре VOICES. */
  orphanDirs: string[];
}

export function status(
  voices: Record<string, string | null> = VOICES as Record<string, string | null>,
  baseDir: string = CASTS_DIR,
): SyncReport {
  const layers = castLayers(voices, baseDir);
  const registry = new Set(Object.keys(voices));
  return {
    layers,
    wiredNoRef: layers.filter((l) => l.wired && !l.ref).map((l) => l.name),
    refNotWired: layers.filter((l) => !l.wired && l.ref).map((l) => l.name),
    orphanDirs: layers.filter((l) => l.dir && !registry.has(l.name)).map((l) => l.name),
  };
}

/** Заглушка контракта нового каста (поля заполняет владелец). */
export function contractStub(name: string): string {
  return `import type { CastContract } from "../../cast.types.mts";

export const ${contractIdent(name)}: CastContract = {
  name: ${JSON.stringify(name)},
  gender: "?",
  age: "?",
  who: "",
  instruct_en: "",
  instruct_ru: "",
  texts: [],
};
`;
}

export interface UpdatePlan {
  /** касты из SPEAKERS без папки casts/voices/{Имя}/. */
  newCasts: string[];
  /** что будет создано при --apply (пути относительно casts/voices/). */
  files: string[];
}

/** План структуры новым кастам: папка + gen_selected/ + generated/ + контракт-заглушка. */
export function planUpdate(baseDir: string = CASTS_DIR): UpdatePlan {
  const casts = new Set<string>();
  for (const v of Object.values(SPEAKERS as Record<string, string | null>)) {
    if (v && !SKIP_CAST_NAMES.has(v)) casts.add(v);
  }
  casts.add("Narrator");
  const newCasts = [...casts].filter((c) => !existsSync(join(baseDir, c))).sort();
  const files: string[] = [];
  for (const c of newCasts) {
    files.push(`${c}/`, `${c}/gen_selected/`, `${c}/generated/`, `${c}/${c}.mts`);
  }
  return { newCasts, files };
}

/** Создание структуры новым кастам (только после --apply, ничего не удаляя). */
export function applyUpdate(plan: UpdatePlan, baseDir: string = CASTS_DIR): string[] {
  const created: string[] = [];
  for (const c of plan.newCasts) {
    const dir = join(baseDir, c);
    mkdirSync(join(dir, "gen_selected"), { recursive: true });
    mkdirSync(join(dir, "generated"), { recursive: true });
    writeFileSync(join(dir, `${c}.mts`), contractStub(c), "utf-8");
    created.push(c);
  }
  return created;
}

function main(argv: string[]): number {
  const cmd = argv[0];
  if (cmd === "status") {
    const r = status();
    console.log("Слои кастов (casts/voices/):");
    for (const l of r.layers) {
      const marks = [
        l.dir ? "dir" : null,
        l.contract ? "contract" : null,
        l.wired ? "wired" : null,
        l.ref ? "ref" : null,
      ]
        .filter(Boolean)
        .join(" ");
      console.log(
        `  ${l.dir || l.wired ? "[+]" : "[--]"} ${l.name.padEnd(24)} ${marks}` +
          (l.variants ? ` variants=${l.variants}` : "") +
          (l.generated ? ` generated=${l.generated}` : ""),
      );
    }
    const problems = [
      ...r.wiredNoRef.map((n) => `подключён, но НЕТ рефа: ${n}`),
      ...r.refNotWired.map((n) => `реф есть, но НЕ подключён: ${n}`),
      ...r.orphanDirs.map((n) => `папка без реестра VOICES: ${n}`),
    ];
    console.log(problems.length ? "=== расхождения ===" : "=== расхождений нет ===");
    for (const p of problems) console.log(`  ${p}`);
    return 0;
  }
  if (cmd === "update") {
    const apply = argv.includes("--apply");
    const plan = planUpdate();
    console.log(`новых кастов без папки: ${plan.newCasts.length}`);
    for (const c of plan.newCasts) console.log(`  ${c}`);
    if (!apply) {
      if (plan.newCasts.length) console.log("dry-run: без --apply структура НЕ создаётся.");
      return 0;
    }
    for (const c of applyUpdate(plan)) {
      console.log(`✓ структура: casts/voices/${c}/ (+ ${c}.mts заглушка)`);
    }
    console.log("  (реестр VOICES — casts/voices.mts, руками; озвучка рефа — add_candidate.mts)");
    return 0;
  }
  console.error("Usage: node voice_sync.mts {status|update [--apply]}");
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
