/**
 * cast_contract.mts — дамп контрактов кастов casts/voices/{Имя}/{Имя}.mts в JSON.
 *
 * Источник истины контрактов — TS-модули (контракт: casts/cast.types.mts);
 * yaml-контракты удалены при миграции 2026-10-21. Python-потребители
 * (voice_design.py) вызывают этот CLI и получают {Имя: контракт} на stdout —
 * мост «.mts → json», чтобы не плодить парсеры TS внутри питона.
 *
 * Запуск:
 *   node cast_contract.mts --all           # все контракты -> JSON-объект
 *   node cast_contract.mts --cast Oryon    # один контракт -> JSON-объект
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import type { CastContract } from "../../../casts/cast.types.mts";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = join(SCRIPTS_DIR, "..", "..", "..");
export const CASTS_DIR = join(PKG_ROOT, "casts", "voices");

/** Папки casts/voices, у которых есть контракт {Имя}.mts (отсортированы). */
export function contractDirs(dir: string = CASTS_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, `${d}.mts`)))
    .sort((a, b) => a.localeCompare(b, "en"));
}

/** Динамический импорт {Имя}.mts -> контракт (единственный «объектный» экспорт). */
export async function loadContract(name: string, dir: string = CASTS_DIR): Promise<CastContract> {
  const file = join(dir, name, `${name}.mts`);
  const mod: Record<string, unknown> = await import(pathToFileURL(file).href);
  const contract = Object.values(mod).find((v) => v !== null && typeof v === "object" && "name" in v && "texts" in v);
  if (!contract) throw new Error(`${name}: в ${file} нет экспорта-контракта`);
  return contract as CastContract;
}

/** Все контракты: {Имя: контракт} (имя = имя папки = поле name). */
export async function loadAll(dir: string = CASTS_DIR): Promise<Record<string, CastContract>> {
  const out: Record<string, CastContract> = {};
  for (const name of contractDirs(dir)) {
    out[name] = await loadContract(name, dir);
  }
  return out;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      all: { type: "boolean" },
      cast: { type: "string" },
    },
  });
  if (!values.all === !values.cast) {
    process.exit("нужен ровно один флаг: --all ИЛИ --cast <Имя>");
  }
  const data = values.all ? await loadAll() : { [values.cast as string]: await loadContract(values.cast as string) };
  process.stdout.write(`${JSON.stringify(data, null, 1)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
