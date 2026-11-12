/**
 * build_pack.mts — сборка дистрибутивных zip'ов AI Voice Pack (патч TSSR).
 * Порт build_pack.py (миграция python → TS, приказ владельца 2026-10-23).
 *
 * Схема zip'ов (решение 2026-10-18, одна Nexus-страница = хаб патчей):
 *   main      — ядро: mods/tssr-ai-voice-pack/ (scripts, catalog, tl/),
 *               environment.txt, INSTALL.txt
 *   voice-<l> — озвучка языка: mods/tssr-ai-voice-pack/ai_voice/<l>/
 *
 * Раскладка ВНУТРИ zip = РАСКЛАДКА УСТАНОВКИ: распаковка в корень папки игры
 * (там, где TheSurvivalofSarahRose.exe). ВСЁ живёт в атомарной папке
 * mods/tssr-ai-voice-pack/ — установка мода = распаковка, удаление = удалить
 * эту папку (+ environment.txt, если других модов нет). Другие моды кладутся
 * в mods/<своя-папка>/ — движок подхватывает их автоматически (RENPY_SEARCHPATH
 * = "mods", обход рекурсивный). Аудио кладём без сжатия (opus и так сжат;
 * ZIP_STORED = заметно быстрее, размер тот же).
 *
 * Запуск (из anywhere):  node patches/ai-voice-pack/tools/build/build_pack.mts
 * Артефакты: <repo>/dist/*.zip  (dist/ в .gitignore — зипы не коммитим).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { writeZip, type ZipEntry } from "./zip.mts";

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
// dev-дерево, аудио (уезжает отдельным voice-zip), каталог целиком (в зип
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
// who -> variant); в zip идут как АРТЕФАКТЫ СБОРКИ — в репе каталог/ не живёт
// (легаси выпищен 2026-10-22), генерит catalog_gen.mts из POT + casts.
export const CATALOG_RUNTIME = ["label_arc.json", "voice_list.json"] as const;
export const CATALOG_GEN = join(PATCH, "tools", "generate", "scripts", "catalog_gen.mts");

export const ENVIRONMENT_TXT = `# TSSR mod: внешний search path (Ren'Py читает этот файл в корне игры при старте).
# Путь ОТНОСИТЕЛЬНЫЙ корню игры — работает при любой локации установки.
# В папку mods/ можно класть и другие моды (папка на мод) — движок подхватит.
# Multiple mods: add more paths separated by ::  (example: "mods::mods_other")
RENPY_SEARCHPATH = "mods"
`;

export const INSTALL_TXT = `THE SURVIVAL OF SARAH ROSE — AI Voice Pack + Localization (11 languages)
=========================================================================

СОСТАВ / FILES
  TSSR-AI-Voice-Pack-main.zip      — ядро БЕЗ АУДИО: тексты 11 языков, все
                                     шрифты, меню, установщик (обязательный) /
                                     core, NO audio: texts, fonts, menu
  TSSR-AI-Voice-Pack-voice-<lang>.zip — голоса языка (СКАЧИВАЕТСЯ ОТДЕЛЬНО,
                                     сколько хочешь: ru, en, de, es, fr, it,
                                     ja, ko, pl, pt, zh) / voice packs are
                                     SEPARATE downloads, pick 1..N

ПОРЯДОК / ORDER:
  1. СНАЧАЛА main (обязательно) — его установщик ставит ядро: тексты 11
     языков, все шрифты, меню. Аудио в main НЕТ.
  2. ПОТОМ голоса — захочешь: скачай voice-пакеты нужных языков (1..N) и
     у КАЖДОГО запусти ЕГО install.cmd — пакет ставится атомарно, один за
     другим. Установщик пакета проверит, что main стоит (без ядра попросит
     поставить его первым).
     FIRST main (required) — core only: texts, fonts, menu. NO audio.
     THEN voices: download the packs you want (1..N), run EACH pack's own
     install.cmd — each installs atomically. The pack installer checks the
     core is present (asks for main first otherwise).

УСТАНОВКА / INSTALL (папка игры = папка с TheSurvivalofSarahRose.exe):
  А. main.zip: распакуй куда угодно и запусти install.cmd — он сам найдёт
     игру и поставит ядро. ИЛИ вручную: распакуй main.zip в корень игры.
     Unpack main.zip anywhere and run its install.cmd (finds the game), or
     manually unpack into the game root.
  Б. каждый voice-<lang>.zip: распакуй куда угодно и запусти ЕГО install.cmd
     — поставит только свой язык, атомарно. ИЛИ вручную: распакуй в корень
     игры. Unpack each voice zip anywhere and run its own install.cmd, or
     manually unpack into the game root.
  В. Запусти игру. Настройки: кнопка языка в меню — 11 языков.
     Launch the game. Settings: language button in the menu — 11 languages.

ВАЖНО / IMPORTANT: перед установкой ЗАКРОЙ игру (игра держит шрифты и файлы
мода; установщик ждёт закрытия до 3 минут, потом попросит). / Close the game
before installing (it locks fonts and mod files; the installer waits up to
3 minutes, then asks you to close it).

ПРИМЕЧАНИЕ / NOTE: если Windows показала предупреждение при запуске install.cmd —
файл скачан из интернета («Mark of the Web»). Скрипт открытый, исходники на
GitHub; ручная установка (пункты 1–2) — равноценный путь.
If Windows showed a warning running install.cmd — the file came from the
internet (Mark of the Web). The script is open source on GitHub; manual
install (steps 1-2) is an equal alternative.

Всё лежит в одной папке mods/tssr-ai-voice-pack/ (плюс служебный
environment.txt в корне игры). Другие моды можно класть в mods/ рядом.
Everything lives in mods/tssr-ai-voice-pack/ (plus the service file
environment.txt in the game root). Other mods can go into mods/ next to it.

УДАЛЕНИЕ / UNINSTALL:
  Удали папку mods/tssr-ai-voice-pack и файл environment.txt.
  Delete the mods/tssr-ai-voice-pack folder and the environment.txt file.

Совместимость / Requires: официальная игра v0.79 (The Survival of Sarah Rose).
Проверено / Verified: 2026-10-19.
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

/** Файл в zip: opus — store (уже сжат), остальное — deflate. */
function zipEntry(name: string, src: string): ZipEntry {
  return { name, path: src, store: suffixOf(basename(src)).toLowerCase() === ".opus" };
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
export function buildMain(outDir: string): BuildResult {
  const name = "TSSR-AI-Voice-Pack-main.zip";
  const target = join(outDir, name);
  const entries: ZipEntry[] = [];
  // Установщик «для ленивых» — в КОРНЕ архива (рядом с mods/):
  // двойной клик по install.cmd находит игру и ставит всё сам.
  for (const fn of ["install.cmd", "install.ps1"]) {
    entries.push(zipEntry(fn, join(PATCH, "tools", "build", "installer", fn)));
  }
  for (const [arcname, content] of [
    ["INSTALL.txt", INSTALL_TXT],
    ["environment.txt", ENVIRONMENT_TXT],
  ] as const) {
    entries.push({ name: arcname, data: Buffer.from(content, "utf-8"), store: false });
  }
  // Зеркало установки: всё дерево патча кроме dev-only (MOD_EXCLUDE).
  // Шрифты ВСЕ едут в main (владелец 2026-11-12: шрифт = часть текста,
  // текст живёт в main; без шрифта иероглифы — квадраты).
  for (const p of treeFiles(PATCH, MOD_EXCLUDE)) {
    entries.push(zipEntry(`${MOD_DIR}/${relative(PATCH, p).split(sep).join("/")}`, p));
  }
  // Рантайм-каталог — артефакт сборки (каталог/ в репе нет): генератор
  // валит сборку сам, если POT/войсы не дают полные мапы.
  const payload = catalogPayload();
  for (const fn of CATALOG_RUNTIME) {
    entries.push({ name: `${MOD_DIR}/catalog/${fn}`, data: payload[fn], store: false });
  }
  const { nfiles, nbytes } = writeZip(target, entries, { level: 9 });
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
  const name = `TSSR-AI-Voice-Pack-voice-${lang}.zip`;
  const target = join(outDir, name);
  const entries: ZipEntry[] = [];
  for (const p of treeFiles(src)) {
    entries.push(zipEntry(`${MOD_DIR}/ai_voice/${lang}/${relative(src, p).split(sep).join("/")}`, p));
  }
  entries.push(zipEntry("install.cmd", join(PATCH, "tools", "build", "installer", "install.cmd")));
  entries.push(zipEntry("install.ps1", join(PATCH, "tools", "build", "installer", "voice_install.ps1")));
  const { nfiles, nbytes } = writeZip(target, entries);
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
    const zipMib = statSync(target).size / (1 << 20);
    console.log(
      `  ${name.padEnd(34)} файлов: ${String(nfiles).padStart(6)}  ` +
        `несжатое: ${mib.toFixed(1).padStart(8)} MiB  zip: ${zipMib.toFixed(1).padStart(7)} MiB`,
    );
  }
}

// Запуск как скрипт (не при импорте из тестов) — аналог if __name__ == "__main__".
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    if (e instanceof BuildAbort) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
}
