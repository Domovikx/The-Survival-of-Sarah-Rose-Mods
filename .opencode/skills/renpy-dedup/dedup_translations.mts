#!/usr/bin/env node

/**
 * @module dedup_translations
 * @description Ren'Py Translation Deduplicator — удаляет дублирующиеся old строки
 * в Ren'Py translation files. Ren'Py не допускает одинаковые old строки в разных
 * файлах одного перевода — это вызывает исключение.
 *
 * Требования:
 * - Node.js >= 18 (использует fs.readFileSync, fs.writeFileSync, fs.readdirSync, path.join, path.relative)
 * - Никаких внешних зависимостей — только встроенные модули node:fs, node:path, node:process
 *
 * Использование:
 *   node dedup_translations.mts                          # дедупликация ru (по умолчанию)
 *   node dedup_translations.mts --lang de                # другой язык
 *   node dedup_translations.mts --dry-run                # предпросмотр
 *   node dedup_translations.mts --verbose                # подробный вывод
 *   node dedup_translations.mts --project /path          # указать проект
 *   node dedup_translations.mts --tl /path/to/tl/ru       # прямой путь к tl
 *
 * @see {@link https://nodejs.org/docs/latest-v18.x/api/fs.html|Node.js fs docs}
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** @constant {number} */
export const VERSION = 1;

/** Регулярка для строк old "...". @type {RegExp} */
export const OLD_RE = /^[ \t]*old +"((?:[^"\\]|\\.)*)"[ \t]*$/;

/** Регулярка для строк new "...". @type {RegExp} */
export const NEW_RE = /^[ \t]*new +"((?:[^"\\]|\\.)*)"[ \t]*$/;

/** Запись old/new-пары из .rpy файла. */
interface TranslationEntry {
  file: string;
  line: number;
  old: string;
  new: string;
}

/** Опции дедупликации. */
interface DeduplicateOptions {
  lang?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

/** Итоговая статистика дедупликации. */
interface DeduplicateResult {
  totalEntries: number;
  totalDuplicates: number;
  duplicatesRemoved: number;
  filesModified: number;
}

/**
 * Парсит translate <lang> strings: блоки, возвращает массив
 * [lineNumber, oldText, newText].
 * Учитывает многострочные old/new (с конкатенацией).
 *
 * @param {string} text - содержимое .rpy файла
 * @returns {Array<[number, string, string]>}
 */
export function parseTranslateBlocks(text: string): Array<[number, string, string]> {
  const results: Array<[number, string, string]> = [];
  const lines = text.split("\n");
  let inBlock = false;
  let currentOld: string | null = null;
  let currentNew: string | null = null;
  let oldLineno: number | null = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.trim();

    // Определяем начало блока translate <lang> strings:
    if (!inBlock && stripped.startsWith("translate ") && stripped.endsWith("strings:")) {
      inBlock = true;
      i++;
      continue;
    }

    if (!inBlock) {
      i++;
      continue;
    }

    // Комментарий внутри блока — пропускаем
    if (stripped.startsWith("#")) {
      i++;
      continue;
    }

    // Пустая строка внутри блока — просто пропускаем
    if (stripped === "") {
      i++;
      continue;
    }

    // Достигнут конец translate блока — начинается новый translate
    if (stripped.startsWith("translate ")) {
      if (currentOld !== null && currentNew !== null) {
        results.push([oldLineno!, currentOld, currentNew]);
        currentOld = null;
        currentNew = null;
        oldLineno = null;
      }
      inBlock = true;
      i++;
      continue;
    }

    const oldMatch = OLD_RE.exec(line);
    const newMatch = NEW_RE.exec(line);

    if (oldMatch) {
      // Если был предыдущий незавершённый — сохраняем
      if (currentOld !== null && currentNew !== null) {
        results.push([oldLineno!, currentOld, currentNew]);
      }
      currentOld = oldMatch[1];
      currentNew = null;
      oldLineno = i;
    } else if (newMatch) {
      currentNew = newMatch[1];
    }

    i++;
  }

  // Последняя пара
  if (currentOld !== null && currentNew !== null) {
    results.push([oldLineno!, currentOld, currentNew]);
  }

  return results;
}

/**
 * Сканирует все .rpy файлы в tlDir и собирает все old/new пары.
 *
 * @param {string} tlDir - путь к tl/<lang>/
 * @returns {Array<{ file: string, line: number, old: string, new: string }>}
 */
export function findAllEntries(tlDir: string): TranslationEntry[] {
  const entries: TranslationEntry[] = [];

  const rpyFiles: string[] = [];

  function walk(dir: string): void {
    let dirEntries: Dirent[];
    try {
      dirEntries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of dirEntries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".rpy")) {
        rpyFiles.push(fullPath);
      }
    }
  }

  walk(tlDir);
  rpyFiles.sort();

  if (rpyFiles.length === 0) {
    console.log(`  [WARN] .rpy файлы не найдены в ${tlDir}`);
    return entries;
  }

  for (const rpyFile of rpyFiles) {
    let text: string;
    try {
      text = readFileSync(rpyFile, "utf-8");
    } catch {
      try {
        text = readFileSync(rpyFile, "utf-8-sig" as BufferEncoding);
      } catch (e) {
        console.log(`  [ERROR] Не удалось прочитать ${rpyFile}: ${(e as { message?: string }).message}`);
        continue;
      }
    }

    const pairs = parseTranslateBlocks(text);
    for (const [lineNo, oldText, newText] of pairs) {
      entries.push({
        file: rpyFile,
        line: lineNo,
        old: oldText,
        new: newText,
      });
    }
  }

  return entries;
}

/**
 * Группирует записи по old строке, возвращает только те,
 * что встречаются >1 раза, отсортированные по файлу и строке.
 *
 * @param {Array<{ file: string, line: number, old: string, new: string }>} entries
 * @returns {Map<string, Array<{ file: string, line: number, old: string, new: string }>>}
 */
export function findDuplicates(entries: TranslationEntry[]): Map<string, TranslationEntry[]> {
  const groups = new Map<string, TranslationEntry[]>();

  for (const entry of entries) {
    const key = entry.old;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(entry);
  }

  const duplicates = new Map<string, TranslationEntry[]>();

  for (const [key, group] of groups) {
    if (group.length > 1) {
      group.sort((a, b) => {
        const fileCmp = String(a.file).localeCompare(String(b.file));
        return fileCmp !== 0 ? fileCmp : a.line - b.line;
      });
      duplicates.set(key, group);
    }
  }

  return duplicates;
}

/**
 * Основная функция дедупликации.
 *
 * @param {string} tlDir - Путь к tl/<lang>/
 * @param {object} [options]
 * @param {string} [options.lang='ru'] - Язык (только для заголовков)
 * @param {boolean} [options.dryRun=false] - Если true — только показать
 * @param {boolean} [options.verbose=false] - Подробный вывод
 * @returns {{ totalEntries: number, totalDuplicates: number, duplicatesRemoved: number, filesModified: number }}
 */
export function deduplicate(tlDir: string, options: DeduplicateOptions = {}): DeduplicateResult {
  const { lang = "ru", dryRun = false, verbose = false } = options;

  const projectRoot = findProjectRoot(tlDir);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Ren'Py Translation Deduplicator v${VERSION}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  Язык: ${lang}`);
  console.log(`  Директория: ${tlDir}`);
  console.log(`  Режим: ${dryRun ? "ПРЕДПРОСМОТР (без изменений)" : "ДЕДУПЛИКАЦИЯ"}`);
  console.log(`${"=".repeat(60)}\n`);

  // Собираем все записи
  const entries = findAllEntries(tlDir);
  console.log(`  Найдено old/new пар: ${entries.length}`);

  if (entries.length === 0) {
    console.log("  Нет записей для обработки.");
    return { totalEntries: 0, totalDuplicates: 0, duplicatesRemoved: 0, filesModified: 0 };
  }

  // Находим дубликаты
  const duplicates = findDuplicates(entries);
  const totalDupGroups = duplicates.size;
  const totalDupEntries = [...duplicates.values()].reduce((sum, g) => sum + g.length, 0);

  console.log(`  Дублирующихся old строк: ${totalDupGroups}`);
  console.log(`  Всего дублирующихся вхождений: ${totalDupEntries}`);

  if (totalDupEntries === 0) {
    console.log("\n  Дубликаты не найдены — всё чисто! [OK]");
    return { totalEntries: entries.length, totalDuplicates: 0, duplicatesRemoved: 0, filesModified: 0 };
  }

  // Собираем статистику по файлам
  const filesToModify = new Map<string, Array<[number, string]>>();

  for (const [oldText, group] of duplicates) {
    // Первый экземпляр — оставляем
    const first = group[0];
    const rest = group.slice(1);

    const displayOld = oldText.length > 80 ? oldText.slice(0, 80) + "..." : oldText;
    console.log(`\n  old: ${displayOld}`);
    console.log(`    [KEEP] ${relativize(first.file, projectRoot)}:${first.line + 1}`);

    for (const entry of rest) {
      const relPath = relativize(entry.file, projectRoot);
      console.log(`    [DUPLICATE] ${relPath}:${entry.line + 1}`);

      const key = entry.file;
      if (!filesToModify.has(key)) {
        filesToModify.set(key, []);
      }
      filesToModify.get(key)!.push([entry.line, oldText]);
    }
  }

  console.log(`\n  Файлов с дубликатами: ${filesToModify.size}`);

  if (dryRun) {
    console.log(`\n  Предпросмотр завершён. Будет удалено ${totalDupEntries - totalDupGroups} дублирующихся записей.`);
    return {
      totalEntries: entries.length,
      totalDuplicates: totalDupEntries,
      duplicatesRemoved: 0,
      filesModified: 0,
    };
  }

  // Удаляем дубликаты
  let removedCount = 0;
  let modifiedCount = 0;

  for (const [filepathStr, linesToRemove] of filesToModify) {
    const rel = relativize(filepathStr, projectRoot);
    let text: string;
    try {
      text = readFileSync(filepathStr, "utf-8");
    } catch {
      try {
        text = readFileSync(filepathStr, "utf-8-sig" as BufferEncoding);
      } catch (e) {
        console.log(`  [ERROR] Не удалось прочитать для записи ${filepathStr}: ${(e as { message?: string }).message}`);
        continue;
      }
    }

    let lines = text.split("\n");

    // Сортируем строки для удаления в обратном порядке (с конца файла)
    // чтобы не сбивать номера строк
    const seen = new Set<string>();
    const uniqueToRemove: Array<[number, string]> = [];
    for (const [ln, old] of linesToRemove) {
      const key = `${ln}:${old}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueToRemove.push([ln, old]);
      }
    }
    uniqueToRemove.sort((a, b) => b[0] - a[0]);

    let fileModified = false;

    for (const [lineNo, oldText] of uniqueToRemove) {
      if (OLD_RE.test(lines[lineNo])) {
        const deleteLines = new Set([lineNo]);

        // Ищем new на следующей строке
        if (lineNo + 1 < lines.length && NEW_RE.test(lines[lineNo + 1])) {
          deleteLines.add(lineNo + 1);
        }

        // Удаляем строки в обратном порядке
        for (const ln of [...deleteLines].sort((a, b) => b - a)) {
          lines.splice(ln, 1);
        }

        fileModified = true;
        removedCount++;
      }
    }

    if (fileModified) {
      // Чистим множественные пустые строки (оставляем максимум 2 подряд)
      const cleaned: string[] = [];
      let emptyCount = 0;
      for (const line of lines) {
        if (line.trim() === "") {
          emptyCount++;
          if (emptyCount <= 2) {
            cleaned.push(line);
          }
        } else {
          emptyCount = 0;
          cleaned.push(line);
        }
      }

      const newText = cleaned.join("\n");
      writeFileSync(filepathStr, newText, "utf-8");
      modifiedCount++;
      if (verbose) {
        console.log(`  [MODIFIED] ${rel}`);
      }
    }
  }

  const result: DeduplicateResult = {
    totalEntries: entries.length,
    totalDuplicates: totalDupEntries,
    duplicatesRemoved: removedCount,
    filesModified: modifiedCount,
  };

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Результат:`);
  console.log(`    Всего old/new пар: ${result.totalEntries}`);
  console.log(`    Дублирующихся вхождений: ${result.totalDuplicates}`);
  console.log(`    Удалено дубликатов: ${result.duplicatesRemoved}`);
  console.log(`    Изменено файлов: ${result.filesModified}`);
  console.log(`${"=".repeat(60)}\n`);

  return result;
}

/**
 * Находит корень проекта (где лежит game/) из tlDir.
 * @param {string} tlDir
 * @returns {string}
 */
function findProjectRoot(tlDir: string): string {
  const parts = tlDir.split(sep);
  const tlIdx = parts.lastIndexOf("tl");
  if (tlIdx >= 2) {
    return parts.slice(0, tlIdx - 1).join(sep);
  }
  return tlDir;
}

/**
 * Формирует относительный путь от корня проекта.
 * @param {string} filepath
 * @param {string} projectRoot
 * @returns {string}
 */
function relativize(filepath: string, projectRoot: string): string {
  try {
    return relative(projectRoot, filepath).split(sep).join("/");
  } catch {
    return filepath;
  }
}

/**
 * CLI entry point.
 */
function main(): void {
  const args = process.argv.slice(2);

  let lang = "ru";
  let dryRun = false;
  let verbose = false;
  let projectPath: string | null = null;
  let tlPath: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--lang" || arg === "-l") {
      lang = args[++i];
    } else if (arg === "--dry-run" || arg === "-n") {
      dryRun = true;
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    } else if (arg === "--project" || arg === "-p") {
      projectPath = args[++i];
    } else if (arg === "--tl") {
      tlPath = args[++i];
    }
  }

  let projectDir: string;
  if (projectPath) {
    projectDir = projectPath;
  } else {
    const scriptDir = join(fileURLToPath(new URL(".", import.meta.url)));
    projectDir = join(scriptDir, "..", "..", "..");
    if (readdirSync(projectDir).includes("game")) {
      // use as-is
    } else {
      projectDir = join(projectDir, "..");
    }
  }

  // --tl имеет приоритет: в этом репо переводы в patches/ai-voice-pack/tl/,
  // а не в game/tl/.
  const tlDir = tlPath ?? join(projectDir, "game", "tl", lang);

  const result = deduplicate(tlDir, { lang, dryRun, verbose });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
