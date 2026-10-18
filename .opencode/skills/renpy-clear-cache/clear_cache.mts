#!/usr/bin/env node

/**
 * @module clear_cache
 * @description Ren'Py Cache Cleaner — удаляет файлы кэша Ren'Py (*.rpyc, __pycache__, *.log).
 *
 * Требования:
 * - Node.js >= 18 (использует fs.readdirSync, fs.unlinkSync, fs.rmdirSync, fs.statSync, path.relative)
 * - Никаких внешних зависимостей — только встроенные модули node:fs, node:path, node:process
 *
 * Использование:
 *   node clear_cache.mts                    # Очистить game/
 *   node clear_cache.mts /path/to/game      # Указать путь
 *   node clear_cache.mts --dry-run          # Показать что будет удалено без удаления
 *   node clear_cache.mts --verbose          # Подробный вывод
 *
 * @see {@link https://nodejs.org/docs/latest-v18.x/api/fs.html|Node.js fs docs}
 */

import { readdirSync, statSync, unlinkSync, rmdirSync, existsSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const VERSION: number = 1;

/** Расширения файлов для удаления */
export const CACHE_EXTENSIONS: Set<string> = new Set([".rpyc", ".log", ".tmp"]);

/** Имена директорий для удаления */
export const CACHE_DIRS: Set<string> = new Set(["__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache"]);

/** Опции очистки кэша. */
interface ClearCacheOptions {
  /** Если true — только показать, не удалять @default false */
  dryRun?: boolean;
  /** Подробный вывод @default false */
  verbose?: boolean;
}

/** Результат очистки кэша. */
interface ClearCacheResult {
  filesRemoved: number;
  dirsRemoved: number;
  spaceFreed: number;
}

/**
 * Нормализовать расширение файла (нижний регистр).
 */
function extname(filepath: string): string {
  const dot = filepath.lastIndexOf(".");
  return dot === -1 ? "" : filepath.slice(dot).toLowerCase();
}

/**
 * Рекурсивный обход директории, пропуская .git.
 * @param dir - абсолютный путь
 */
function walk(dir: string, fn: (filepath: string, isDir: boolean) => void): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const fullPath = join(dir, entry.name);
    fn(fullPath, entry.isDirectory());
    if (entry.isDirectory()) {
      walk(fullPath, fn);
    }
  }
}

/**
 * Находит все файлы кэша в директории игры.
 * @param gameDir - абсолютный путь к game/
 * @returns список путей к файлам кэша
 */
export function findCacheFiles(gameDir: string): string[] {
  const cacheFiles: string[] = [];

  walk(gameDir, (filepath: string, isDir: boolean): void => {
    if (!isDir) {
      if (CACHE_EXTENSIONS.has(extname(filepath))) {
        cacheFiles.push(filepath);
      }
      return;
    }
    if (CACHE_DIRS.has(filepath.split(sep).pop() ?? "")) {
      try {
        const sub = readdirSync(filepath, { withFileTypes: true });
        for (const subEntry of sub) {
          const subPath = join(filepath, subEntry.name);
          if (subEntry.isFile()) {
            cacheFiles.push(subPath);
          }
        }
      } catch {
        // ignore
      }
    }
  });

  return cacheFiles;
}

/**
 * Находит все директории кэша в директории игры.
 * @param gameDir - абсолютный путь к game/
 * @returns список путей к директориям кэша
 */
export function findCacheDirs(gameDir: string): string[] {
  const cacheDirs: string[] = [];

  walk(gameDir, (filepath: string, isDir: boolean): void => {
    if (isDir) {
      const name = filepath.split(sep).pop() ?? "";
      if (CACHE_DIRS.has(name)) {
        cacheDirs.push(filepath);
      }
    }
  });

  return cacheDirs;
}

/**
 * Форматирует размер в читаемый вид.
 */
export function sizeStr(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  } else if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

/**
 * Очищает кэш Ren'Py.
 *
 * @param gameDir - Путь к game/
 * @param options - Если dryRun=true — только показать, не удалять; verbose — подробный вывод
 */
export function clearCache(gameDir: string, options: ClearCacheOptions = {}): ClearCacheResult {
  const { dryRun = false, verbose = false } = options;

  if (!existsSync(gameDir)) {
    console.error(`ERROR: Директория не найдена: ${gameDir}`);
    return { filesRemoved: 0, dirsRemoved: 0, spaceFreed: 0 };
  }

  const cacheFiles = findCacheFiles(gameDir);
  const cacheDirs = findCacheDirs(gameDir);

  let totalSize = 0;
  for (const f of cacheFiles) {
    try {
      totalSize += statSync(f).size;
    } catch {
      // ignore
    }
  }

  const results: ClearCacheResult = { filesRemoved: 0, dirsRemoved: 0, spaceFreed: 0 };

  if (cacheFiles.length === 0 && cacheDirs.length === 0) {
    console.log("Кэш не найден — всё чисто! [OK]");
    return results;
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`  Ren'Py Cache Cleaner v${VERSION}`);
  console.log(`${"=".repeat(50)}`);
  console.log(`  Директория: ${gameDir}`);
  console.log(`  Файлов кэша: ${cacheFiles.length}`);
  console.log(`  Директорий кэша: ${cacheDirs.length}`);
  console.log(`  Место для освобождения: ${sizeStr(totalSize)}`);
  if (dryRun) {
    console.log(`  Режим: ПРЕДПРОСМОТР (без удаления)`);
  }
  console.log(`${"=".repeat(50)}\n`);

  const projectRoot = findProjectRoot(gameDir);

  for (const f of cacheFiles.slice().sort()) {
    const rel = relative(projectRoot, f).split(sep).join("/");
    if (verbose || !dryRun) {
      console.log(`  [${dryRun ? "DRY-RUN" : "DEL"}] ${rel}`);
    }
    if (!dryRun) {
      try {
        unlinkSync(f);
        results.filesRemoved++;
      } catch (e) {
        console.error(`    ОШИБКА: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  for (const d of cacheDirs.slice().sort().reverse()) {
    const rel = relative(projectRoot, d).split(sep).join("/");
    if (!dryRun) {
      try {
        if (existsSync(d)) {
          const remaining = readdirSync(d);
          if (remaining.length === 0) {
            rmdirSync(d);
            results.dirsRemoved++;
            if (verbose) {
              console.log(`  [DEL DIR] ${rel}`);
            }
          } else if (verbose) {
            console.log(`  [SKIP DIR] ${rel} (не пуста)`);
          }
        }
      } catch (e) {
        if (verbose) {
          console.log(`  [SKIP DIR] ${rel}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }

  results.spaceFreed = dryRun ? 0 : totalSize;

  console.log(`\n${"=".repeat(50)}`);
  if (dryRun) {
    console.log(`  Превью завершено. Будет удалено ${cacheFiles.length} файлов, освобождено ${sizeStr(totalSize)}`);
  } else {
    console.log(`  Удалено файлов: ${results.filesRemoved}`);
    console.log(`  Удалено директорий: ${results.dirsRemoved}`);
    console.log(`  Освобождено: ${sizeStr(results.spaceFreed)}`);
  }
  console.log(`${"=".repeat(50)}\n`);

  return results;
}

/**
 * Находит корень проекта (где лежит game/).
 */
function findProjectRoot(gameDir: string): string {
  const parts = gameDir.split(sep);
  const gameIdx = parts.lastIndexOf("game");
  if (gameIdx > 0) {
    return parts.slice(0, gameIdx).join(sep);
  }
  return gameDir;
}

/**
 * CLI entry point.
 */
function main(): void {
  const args = process.argv.slice(2);

  const dryRun = args.includes("--dry-run");
  const verbose = args.includes("--verbose") || args.includes("-v");

  const positionalArgs = args.filter((a: string) => !a.startsWith("-"));

  const scriptDir = join(fileURLToPath(new URL(".", import.meta.url)));
  const projectRoot = join(scriptDir, "..", "..", "..");
  let gameDir = join(projectRoot, "game");

  if (positionalArgs.length > 0) {
    gameDir = positionalArgs[0];
  }

  clearCache(gameDir, { dryRun, verbose });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
