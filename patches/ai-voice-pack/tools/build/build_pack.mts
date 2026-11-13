/**
 * build_pack.mts — сборка дистрибутивных .7z AI Voice Pack (патч TSSR).
 *
 * Схема архивов (решение 2026-10-18, одна Nexus-страница = хаб патчей;
 * формат 7z — решение владельца 2026-11-13, целевая ОС Windows 11):
 *   main      — ядро: mods/tssr-ai-voice-pack/ (scripts, catalog, tl/),
 *               environment.txt, README.txt
 *   voice-<l> — озвучка языка: mods/tssr-ai-voice-pack/ai_voice/<l>/
 *
 * Раскладка ВНУТРИ архива = РАСКЛАДКА УСТАНОВКИ: распаковка в корень папки
 * игры (там, где TheSurvivalofSarahRose.exe). ВСЁ живёт в атомарной папке
 * mods/tssr-ai-voice-pack/ — установка мода = распаковка, удаление = удалить
 * эту папку (+ environment.txt, если других модов нет). Другие моды кладутся
 * в mods/<своя-папка>/ — движок подхватывает их автоматически (RENPY_SEARCHPATH
 * = "mods", обход рекурсивный). Уровни сжатия: main -mx=9 (solid находит
 * общее между CJK-шрифтами: 63.6 MiB -> 13.5 вместо 45.1 в zip), голосовые
 * паки -mx=9 (замер: -1.3% к размеру за ~1 с — берём, цель = размер).
 *
 * Запуск (из anywhere):  node patches/ai-voice-pack/tools/build/build_pack.mts
 * Артефакты: <repo>/dist/*.7z  (dist/ в .gitignore — архивы не коммитим).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { ArchiveAbort, writeArchive, type ArchiveEntry } from "./archive.mts";

// ai-voice-pack/tools/build/build_pack.mts -> ../../.. = patches/ai-voice-pack
export const PATCH = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
export const REPO = resolve(PATCH, "..", ".."); // [0] = patches/, [1] = корень репы
export const DIST = join(REPO, "dist");

// Языки озвучки: каталог в репо -> каталог при установке (все 11 языков
// матрицы патча; пакет строится только если каталог непустой).
export const VOICE_LANGS: Record<string, string> = {
  ru: join(PATCH, "audio", "ru"),
  en: join(PATCH, "audio", "en"),
  de: join(PATCH, "audio", "de"),
  es: join(PATCH, "audio", "es"),
  fr: join(PATCH, "audio", "fr"),
  it: join(PATCH, "audio", "it"),
  ja: join(PATCH, "audio", "ja"),
  ko: join(PATCH, "audio", "ko"),
  pl: join(PATCH, "audio", "pl"),
  pt: join(PATCH, "audio", "pt"),
  zh: join(PATCH, "audio", "zh"),
};

// Атомарная папка мода при установке (относительно корня игры)
export const MOD_DIR = "mods/tssr-ai-voice-pack";

// Dev-only в КОРНЕ патча — НЕ в дистрибутив (корень патча = зеркало
// установки 2026-10-19, поэтому исключения — имена ВЕРХНЕГО уровня):
// dev-дерево, аудио (уезжает отдельным voice-пакетом), каталог целиком (в архив
// идут только два runtime-JSON, см. CATALOG_RUNTIME), рефы голосов (casts —
// сырьё генерации), исходники переводов (po — рантайм читает их продукт tl/),
// кэши тестов + defensive-имена диагностик, которые мод пишет в свою папку
// в установке.
export const MOD_EXCLUDE: ReadonlySet<string> = new Set([
  "audio",
  "tools",
  "tests",
  "catalog",
  "README.md",
  "MOD.md",
  "casts",
  "po",
  ".pytest_cache",
  "update_check.txt",
  "last_menu_hook.txt",
  "voice_debug.log",
]);

// Рантайм-каталог: voice_config.rpy грузит ТОЛЬКО эти два JSON (label -> arc,
// who -> variant); в архив идут как АРТЕФАКТЫ СБОРКИ — в репе каталог/ не живёт
// (легаси выпищен 2026-10-22), генерит catalog_gen.mts из POT + casts.
export const CATALOG_RUNTIME = ["label_arc.json", "voice_list.json"] as const;
export const CATALOG_GEN = join(PATCH, "tools", "generate", "scripts", "catalog_gen.mts");

export const ENVIRONMENT_TXT = `# Ren'Py executes this file at startup and applies the variables below.
# RENPY_SEARCHPATH adds "mods" (relative to the game folder) to the engine's
# search path - that is where this mod lives: mods/tssr-ai-voice-pack/.
# The path is RELATIVE, so the game can be installed anywhere.
# Other mods: drop them into mods/ as well, or list more paths separated by ::
# (example: RENPY_SEARCHPATH = "mods::mods_other").
RENPY_SEARCHPATH = "mods"
`;

export const README_TXT = `THE SURVIVAL OF SARAH ROSE - AI Voice Pack + Localization (11 languages)
========================================================================

WHAT IS IN THE DOWNLOADS

  TSSR-AI-Voice-Pack-main.7z
      REQUIRED. The core, with NO audio: texts for 11 languages, all the
      fonts, the game menu changes, and this installer.

  TSSR-AI-Voice-Pack-voice-<lang>.7z
      OPTIONAL. Voice acting for ONE language: ru, en, de, es, fr, it,
      ja, ko, pl, pt, zh. Download as many packs as you like.

ORDER MATTERS: install the core (main) FIRST, then any voice packs.
Every voice pack needs the core and tells you to install main first
if it is missing.

INSTALL (game folder = the folder with TheSurvivalofSarahRose.exe)

  1. Unpack TSSR-AI-Voice-Pack-main.7z anywhere and run install.cmd.
     It finds the game and installs the core.
     Manual alternative: unpack the archive into the game folder.

  2. For each voice pack you want: unpack it anywhere and run ITS OWN
     install.cmd. A pack installs only its own language, atomically, one
     after another. Manual alternative: unpack into the game folder.

  3. Launch the game and pick the language with the language button in
     the menu (11 languages available).

OPENING THE .7z ARCHIVES
Windows 11 opens .7z by double click out of the box. On Windows 10 you
need a free archiver: 7-Zip (https://7-zip.org) or WinRAR.

CLOSE THE GAME BEFORE INSTALLING
The game keeps its fonts and mod files locked. The installer waits up to
3 minutes for it to close, then asks you to close it.

WINDOWS WARNING WHEN RUNNING install.cmd
The archive came from the internet, so Windows may show "Windows
protected your PC" (Mark of the Web). The scripts are open source on
GitHub, and unpacking by hand (steps 1-2 above) is an equal alternative.
To unblock: right-click the archive or install.cmd -> Properties -> Unblock.

WHERE THINGS GO
Everything lives in one folder, mods/tssr-ai-voice-pack/, plus the
service file environment.txt in the game folder. Other mods can sit in
mods/ next to it.

UNINSTALL
Delete the folder mods/tssr-ai-voice-pack/ and the file environment.txt.
Save games are not touched.

REQUIRES
The Survival of Sarah Rose v0.79 (official game).
Verified: 2026-10-19.
`;

/** sys.exit(...) в питоне: сообщение в stderr + exit 1 (ловится тестами). */
export class BuildAbort extends Error {}

// --- Порядок как в pathlib: сортировка по ЧАСТЯМ пути, регистронезависимо ---
// (python 3.14: PurePath.__lt__ сравнивает _parts_normcase — кортёж сегментов
// после normcase; на Windows normcase = «\» + lower()).

function pathParts(p: string): string[] {
  return p.split(/[\\/]/).map((s) => s.toLowerCase());
}

function comparePaths(a: string, b: string): number {
  const pa = pathParts(a);
  const pb = pathParts(b);
  const n = Math.min(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return pa.length - pb.length;
}

/** Запись архива: файл-источник кладётся под своим путём внутри архива. */
function archiveEntry(name: string, src: string): ArchiveEntry {
  return { name, path: src };
}

function suffixOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i <= 0 ? "" : name.slice(i);
}

function collectFiles(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue; // битая ссылка и пр. — как is_file()/is_dir() == False в питоне
    }
    if (st.isDirectory()) {
      collectFiles(p, out);
    } else if (st.isFile()) {
      if (p.split(sep).includes("__pycache__")) continue;
      if (suffixOf(name) === ".rpyc") continue;
      out.push(p);
    }
  }
}

/**
 * Отсортированный список файлов дерева (для воспроизводимости сборки).
 *
 * exclude — имена ВЕРХНЕГО УРОВНЯ (dev-only), которые не шиппим; такие
 * каталоги не обходятся вовсе (audio/ — 134k файлов).
 * .rpyc не шиппим (решение 2026-10-19): двойной источник правды
 * (rpy + rpyc) = тихая рассинхронизация; движок скомпилирует .rpy
 * при первом запуске. В git .rpyc тоже не коммитятся.
 */
export function treeFiles(root: string, exclude: ReadonlySet<string> = new Set()): string[] {
  const files: string[] = [];
  const top = readdirSync(root)
    .map((name) => join(root, name))
    .toSorted(comparePaths);
  for (const entry of top) {
    if (exclude.has(basename(entry))) continue;
    let st;
    try {
      st = statSync(entry);
    } catch {
      continue;
    }
    if (st.isFile()) {
      files.push(entry); // верхний уровень: как в питоне, без фильтра .rpyc
    } else if (st.isDirectory()) {
      collectFiles(entry, files);
    }
  }
  return files.toSorted(comparePaths);
}

/** hasAnyEntry: в питоне — any(src.rglob("*")), т.е. файл ИЛИ каталог на любой
 * глубине; любая запись подразумевает запись в корне -> достаточно readdir. */
function hasAnyEntry(dir: string): boolean {
  return readdirSync(dir).length > 0;
}

// --- Рантайм-каталог (артефакт сборки) ---

export interface CatalogGenResult {
  returncode: number;
  stdout: string;
  stderr: string;
}
export type CatalogGenRunner = (script: string, outDir: string) => CatalogGenResult;

/** Вызов генератора; в тестах подменяется (как monkeypatch subprocess.run). */
export const hooks: { runCatalogGen: CatalogGenRunner } = {
  runCatalogGen(script: string, outDir: string): CatalogGenResult {
    const r = spawnSync(process.execPath, [script, "--out-dir", outDir], { encoding: "utf-8" });
    return { returncode: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  },
};

let catalogCache: Record<string, Buffer> | null = null;

/** Сброс кэша (monkeypatch в тестах = перегенерация при следующем сборе). */
export function resetCatalogCache(): void {
  catalogCache = null;
}

/**
 * Сборочные рантайм-мапы: node catalog_gen.mts -> {имя файла: bytes}.
 *
 * Единственный источник правды — po/template.pot (инвентарь label → arc)
 * и casts/voices.mts (войсы); в репе каталог/ не живёт. Любая проблема
 * генератора = ПОНИЯТНАЯ ошибка сборки: в дистрибутив не попадает пустой
 * или неполный каталог (edge-контракт приёмки).
 */
function catalogPayload(): Record<string, Buffer> {
  if (catalogCache !== null) return catalogCache;
  const staging = mkdtempSync(join(tmpdir(), "tssr_catalog_"));
  try {
    const r = hooks.runCatalogGen(CATALOG_GEN, staging);
    if (r.returncode !== 0) {
      throw new BuildAbort(
        `СБОРКА ОСТАНОВЛЕНА: генератор рантайм-каталога упал (${CATALOG_GEN}):\n` +
          `${r.stdout || ""}${r.stderr || ""}`,
      );
    }
    const payload: Record<string, Buffer> = {};
    for (const fn of CATALOG_RUNTIME) {
      const p = join(staging, fn);
      if (!existsSync(p) || statSync(p).size === 0) {
        throw new BuildAbort(`СБОРКА ОСТАНОВЛЕНА: ${fn} не сгенерирован (${CATALOG_GEN})`);
      }
      const data = readFileSync(p);
      let doc: unknown;
      try {
        doc = JSON.parse(data.toString("utf-8"));
      } catch (e) {
        throw new BuildAbort(`СБОРКА ОСТАНОВЛЕНА: ${fn} — битый JSON: ${String(e)}`);
      }
      if (typeof doc !== "object" || doc === null || Array.isArray(doc) || Object.keys(doc).length === 0) {
        throw new BuildAbort(`СБОРКА ОСТАНОВЛЕНА: ${fn} пустой объект`);
      }
      payload[fn] = data;
    }
    catalogCache = payload;
    return payload;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export interface BuildResult {
  name: string;
  target: string;
  nfiles: number;
  /** несжатое суммарно */
  nbytes: number;
}

/**
 * Ядро патча: атомарная папка мода mods/tssr-ai-voice-pack/ + корень.
 *
 * Сборка = КОПИЯ ДЕРЕВА патча (зеркало установки 2026-10-19): arcname =
 * относительный путь файла — «карта путей» отсутствует, новый файл в репе
 * попадает в дистрибутив сам.
 */
export function buildMain(outDir: string, opts: { level?: number } = {}): BuildResult {
  const name = "TSSR-AI-Voice-Pack-main.7z";
  const target = join(outDir, name);
  const entries: ArchiveEntry[] = [];
  // Установщик «для ленивых» — в КОРНЕ архива (рядом с mods/):
  // двойной клик по install.cmd находит игру и ставит всё сам.
  for (const fn of ["install.cmd", "worker.ps1"]) {
    entries.push(archiveEntry(fn, join(PATCH, "tools", "build", "installer", fn)));
  }
  for (const [arcname, content] of [
    ["README.txt", README_TXT],
    ["environment.txt", ENVIRONMENT_TXT],
  ] as const) {
    entries.push({ name: arcname, data: Buffer.from(content, "utf-8") });
  }
  // Зеркало установки: всё дерево патча кроме dev-only (MOD_EXCLUDE).
  // Шрифты ВСЕ едут в main (владелец 2026-11-12: шрифт = часть текста,
  // текст живёт в main; без шрифта иероглифы — квадраты).
  for (const p of treeFiles(PATCH, MOD_EXCLUDE)) {
    entries.push(archiveEntry(`${MOD_DIR}/${relative(PATCH, p).split(sep).join("/")}`, p));
  }
  // Рантайм-каталог — артефакт сборки (каталог/ в репе нет): генератор
  // валит сборку сам, если POT/войсы не дают полные мапы.
  const payload = catalogPayload();
  for (const fn of CATALOG_RUNTIME) {
    entries.push({ name: `${MOD_DIR}/catalog/${fn}`, data: payload[fn] });
  }
  const { nfiles, nbytes } = writeArchive(target, entries, { level: opts.level ?? 9 });
  return { name, target, nfiles, nbytes };
}

/**
 * Озвучка одного языка: audio/<lang>/** -> mods/.../ai_voice/<lang>/**.
 * Плюс СВОЙ атомарный установщик в корне зипа (владелец 2026-11-12:
 * «отдельные аудио-установщики, атомарно»; предохранитель на ядро main). */
export function buildVoice(lang: string, outDir: string): BuildResult | null {
  const src = VOICE_LANGS[lang];
  let st;
  try {
    st = statSync(src);
  } catch {
    st = null;
  }
  if (!st?.isDirectory() || !hasAnyEntry(src)) {
    console.log(`  voice-${lang}: пропущен (каталог пуст — аудио ещё генерится)`);
    return null;
  }
  const name = `TSSR-AI-Voice-Pack-voice-${lang}.7z`;
  const target = join(outDir, name);
  const entries: ArchiveEntry[] = [];
  for (const p of treeFiles(src)) {
    entries.push(archiveEntry(`${MOD_DIR}/ai_voice/${lang}/${relative(src, p).split(sep).join("/")}`, p));
  }
  entries.push(archiveEntry("install.cmd", join(PATCH, "tools", "build", "installer", "install.cmd")));
  entries.push(archiveEntry("worker.ps1", join(PATCH, "tools", "build", "installer", "voice_install.ps1")));
  // -mx=9: замер 2026-11-13 на реальном пакете — 17 883 317 (store) ->
  // 17 658 043 байт (-1.3%), цена ~1 с на пакет. Жадничаем: цель — размер.
  const { nfiles, nbytes } = writeArchive(target, entries, { level: 9 });
  return { name, target, nfiles, nbytes };
}

function main(): void {
  const argv = process.argv.slice(2);
  const langs = argv.length > 0 ? argv : Object.keys(VOICE_LANGS).toSorted();
  for (const lang of langs) {
    if (!(lang in VOICE_LANGS)) {
      throw new BuildAbort(`неизвестный язык '${lang}' (есть: ${Object.keys(VOICE_LANGS).join(", ")})`);
    }
  }
  mkdirSync(DIST, { recursive: true });
  const results: BuildResult[] = [buildMain(DIST)];
  for (const lang of langs) {
    const r = buildVoice(lang, DIST);
    if (r) results.push(r);
  }
  console.log(`СОБРАНО: ${DIST}`);
  for (const { name, target, nfiles, nbytes } of results) {
    const mib = nbytes / (1 << 20);
    const packMib = statSync(target).size / (1 << 20);
    console.log(
      `  ${name.padEnd(34)} файлов: ${String(nfiles).padStart(6)}  ` +
        `несжатое: ${mib.toFixed(1).padStart(8)} MiB  7z: ${packMib.toFixed(1).padStart(7)} MiB`,
    );
  }
}

// Запуск как скрипт (не при импорте из тестов) — аналог if __name__ == "__main__".
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    if (e instanceof BuildAbort || e instanceof ArchiveAbort) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
}
