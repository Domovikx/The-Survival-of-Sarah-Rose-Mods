/**
 * archive.mts — сборка дистрибутивов в .7z через внешний 7z.exe.
 *
 * Решение владельца 2026-11-13: целевая ОС — Windows 11 (нативное чтение 7z
 * в Explorer с 22H2 Moment 4 / билд 22621.2361, 26.09.2023), поэтому
 * дистрибутив = 7z: main 63.6 MiB распаковки -> 13.5 MiB вместо 45.1 в zip
 * (solid-блок находит общее между тремя CJK-шрифтами), голосовые паки
 * 17.0 -> 17.0 (opus уже сжат; для них -mx=0, чтобы не жечь CPU зря).
 *
 * Свой 7z-писатель на node невозможен без внешних зависимостей (LZMA2 solid
 * + заголовок 7z требуют полноценного энкодера), поэтому шеллим в 7z.exe:
 * это единственная внешняя зависимость сборки, проверяется find7z() с
 * понятной ошибкой. Тесты и сверки читают архивы тем же 7z (системный
 * tar.exe/libarchive 7z НЕ читает — проверено).
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** Понятная ошибка сборки/чтения архива (ловится build_pack как BuildAbort). */
export class ArchiveAbort extends Error {}

const SEVEN_ZIP_CANDIDATES = ["C:\\Program Files\\7-Zip\\7z.exe", "C:\\Program Files (x86)\\7-Zip\\7z.exe"];

/** Достаточно для листинга 1500 файлов и для чтения отдельных JSON/текстов. */
const MAX_BUFFER = 512 << 20;

let cached7z: string | null = null;

/**
 * Путь к 7z.exe: env TSSR_7Z > стандартные папки установки > PATH.
 * Кэшируется (на сборку одного прогона хватает одного поиска).
 */
export function find7z(): string {
  if (cached7z !== null) return cached7z;
  const fromEnv = process.env.TSSR_7Z;
  if (fromEnv) {
    if (!existsSync(fromEnv)) {
      throw new ArchiveAbort(`TSSR_7Z="${fromEnv}": файла нет — укажи путь к 7z.exe`);
    }
    cached7z = fromEnv;
    return cached7z;
  }
  for (const p of SEVEN_ZIP_CANDIDATES) {
    if (existsSync(p)) {
      cached7z = p;
      return cached7z;
    }
  }
  for (const name of ["7z", "7za"]) {
    const r = spawnSync(name, ["i"], { stdio: "ignore" });
    if (r.status === 0) {
      cached7z = name;
      return cached7z;
    }
  }
  throw new ArchiveAbort("7-Zip не найден: поставь 7-Zip (https://7-zip.org) или задай TSSR_7Z=<путь к 7z.exe>");
}

/** Сброс кэша поиска (тесты с подменой TSSR_7Z). */
export function reset7zCache(): void {
  cached7z = null;
}

export interface ArchiveEntry {
  /** путь ВНУТРИ архива, разделитель — прямой слэш */
  name: string;
  /** несжатые байты (служебные тексты/сгенерированные JSON) */
  data?: Buffer;
  /** файл-источник (хардлинком или копией в staging) */
  path?: string;
}

export interface WriteArchiveOptions {
  /** 7z -mx: 9 — main (solid, шрифты), 0 — голосовые паки (opus уже сжат) */
  level?: number;
}

export interface WriteArchiveResult {
  nfiles: number;
  /** несжатое суммарно (как Sum: Size в листинге 7z) */
  nbytes: number;
}

/** Положить запись в staging-каталог; вернуть её несжатый размер. */
function stageEntry(staging: string, e: ArchiveEntry): number {
  const dest = join(staging, ...e.name.split("/"));
  mkdirSync(dirname(dest), { recursive: true });
  if (e.data !== undefined) {
    writeFileSync(dest, e.data);
    return e.data.length;
  }
  if (e.path === undefined) throw new ArchiveAbort(`запись ${e.name}: нет ни data, ни path`);
  // Хардлинк = нулевая цена 63-MiB дерева; на другом томе/ФС — обычная копия.
  try {
    linkSync(resolve(e.path), dest);
  } catch {
    copyFileSync(resolve(e.path), dest);
  }
  return statSync(e.path).size;
}

/**
 * Записать .7z: staging-каталог (arcname = путь внутри архива) + один вызов
 * `7z a -t7z -mx=N target *` с cwd = staging (7z хранит пути относительно cwd,
 * то есть ровно arcname). Существующий target удаляется: `7z a` дописывает.
 */
export function writeArchive(
  target: string,
  entries: Iterable<ArchiveEntry>,
  opts: WriteArchiveOptions = {},
): WriteArchiveResult {
  const sevenZip = find7z();
  const level = opts.level ?? 9;
  const absTarget = resolve(target);
  const staging = mkdtempSync(join(tmpdir(), "tssr_7z_"));
  try {
    let nfiles = 0;
    let nbytes = 0;
    for (const e of entries) {
      nbytes += stageEntry(staging, e);
      nfiles++;
    }
    if (nfiles === 0) throw new ArchiveAbort(`пустой архив ${absTarget}: нет ни одной записи`);
    mkdirSync(dirname(absTarget), { recursive: true });
    rmSync(absTarget, { force: true });
    const r = spawnSync(sevenZip, ["a", "-t7z", `-mx=${level}`, "-bso0", "-bsp0", "-y", absTarget, "*"], {
      cwd: staging,
      encoding: "utf-8",
      maxBuffer: MAX_BUFFER,
    });
    if (r.status !== 0) {
      throw new ArchiveAbort(
        `7z не собрал ${absTarget} (код ${String(r.status)}):\n${r.stdout ?? ""}${r.stderr ?? ""}`,
      );
    }
    // Обязательная проверка: 7z t читает весь архив и сверяет CRC каждого
    // файла. Ни один повреждённый архив не уедет в dist/ (требование
    // владельца 2026-11-13: «проверить, что архивы рабочие»).
    verifyArchive(absTarget);
    return { nfiles, nbytes };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** Тест целостности архива: `7z t` распаковывает всё в память и сверяет CRC. */
export function verifyArchive(target: string): void {
  const r = spawnSync(find7z(), ["t", "-bd", resolve(target)], {
    encoding: "utf-8",
    maxBuffer: MAX_BUFFER,
  });
  if (r.status !== 0) {
    throw new ArchiveAbort(
      `архив ${target} НЕ прошёл проверку целостности (7z t, код ${String(r.status)}):\n` +
        `${r.stdout ?? ""}${r.stderr ?? ""}`,
    );
  }
}

export interface ArchiveRead {
  /** имена ФАЙЛОВ в порядке архива (каталоги отброшены), разделитель "/" */
  names: string[];
  /** несжатые байты записи */
  read(name: string): Buffer;
}

/** Имена файлов архива: `7z l -slt -ba` -> блоки "Path = / Attributes = / ..." */
export function listArchive(target: string): string[] {
  const r = spawnSync(find7z(), ["l", "-slt", "-ba", resolve(target)], {
    encoding: "utf-8",
    maxBuffer: MAX_BUFFER,
  });
  if (r.status !== 0) {
    throw new ArchiveAbort(`7z не прочитал ${target} (код ${String(r.status)}):\n${r.stdout ?? ""}${r.stderr ?? ""}`);
  }
  const names: string[] = [];
  let path: string | null = null;
  let isDir = false;
  const flush = (): void => {
    if (path !== null && !isDir) names.push(path);
    path = null;
    isDir = false;
  };
  for (const line of (r.stdout ?? "").split(/\r?\n/)) {
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith("Path = ")) path = line.slice(7).split("\\").join("/");
    else if (line.startsWith("Attributes = ")) isDir = line.slice(13).trim().startsWith("D");
  }
  flush();
  return names;
}

/** Архив только для чтения (раскладка в тестах: список записей + байты). */
export function readArchive(target: string): ArchiveRead {
  const abs = resolve(target);
  const names = listArchive(abs);
  return {
    names,
    read(name: string): Buffer {
      const r = spawnSync(find7z(), ["e", "-so", "-bd", abs, name], { maxBuffer: MAX_BUFFER });
      if (r.status !== 0) {
        throw new ArchiveAbort(`7z не отдал ${name} из ${target}: ${r.stderr?.toString("utf-8") ?? ""}`);
      }
      return r.stdout;
    },
  };
}
