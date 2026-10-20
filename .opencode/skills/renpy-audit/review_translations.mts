#!/usr/bin/env node

/**
 * @module review_translations
 * @description Аудит целостности переводов Ren'Py: git-ref vs рабочая копия tl
 * vs скан текущей игры. Отвечает на вопросы «что пропало/появилось/потерялось»
 * после extract-регенерации или апдейта игры.
 *
 * Категории:
 *   DROPPED      — пара была в <ref>-tl, из рабочей копии пропала
 *   ADDED        — пара появилась в рабочей копии (не было в <ref>)
 *   NOTINGAME    — пара в рабочей копии, но её old нет в скане игры (сирота)
 *   MISSING      — строка есть в скане игры, но пары нет в рабочей копии
 *   LOST_TRANS   — DROPPED с переводом, чей old ВСЁ ЕЩЁ есть в игре (ПОТЕРЯ)
 *
 * LOST_TRANS/NOTINGAME/MISSING ненулевые => exit code 1 (годится для гейтов).
 * DROPPED/ADDED — информационные (следы реальных правок игры или чистки мусора).
 *
 * Использование:
 *   node review_translations.mts [options]
 *   options: --game <dir> --tl <dir> --ref <git-ref> --lang <code>
 *
 * @see {@link ../renpy-extract/extract_texts.mts|renpy-extract} — общий парсер игры
 */

import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { RenPyExtractor, _unescape } from "../renpy-extract/extract_texts.mts";

/** Пара old/new с файлом-владельцем (относительный путь от корня репы). */
export interface PairInfo {
  old: string;
  new: string | null;
  file: string;
}

/** Ключ — нормализованный old (trim), как у extract/dedup. */
export type PairMap = Map<string, PairInfo>;

/** Результат классификации аудита. */
export interface AuditResult {
  /** Нормализованные old из скана игры. */
  gameOlds: Set<string>;
  /** Были в ref-tl, нет в рабочей копии. */
  dropped: PairInfo[];
  /** Появились в рабочей копии (не было в ref). */
  added: PairInfo[];
  /** В рабочей копии, но старой строки нет в игре (кроме engine-файла). */
  notInGame: PairInfo[];
  /** Строки игры, у которых нет пары в рабочей копии. */
  missing: string[];
  /** DROPPED с переводом, чей old ещё существует в игре — реальная потеря. */
  lostTranslations: PairInfo[];
}

/** Engine-файл: его old живут вне скана игры (builtins), исключается из NOTINGAME. */
export const ENGINE_FILE = "renpy_common.rpy";

/**
 * Нормализация old-строки — тот же ключ, что у RenPyExtractor._norm.
 * @param text - оригинальная строка
 */
export function norm(text: string): string {
  return text.trim();
}

/**
 * Разбирает пары old/new из содержимого .rpy (только translate <lang> strings:).
 * Терпимо к экранированным кавычкам; отсутствующий new -> null.
 * @param text - содержимое файла
 */
export function parsePairs(text: string): Array<{ old: string; new: string | null }> {
  const pairs: Array<{ old: string; new: string | null }> = [];
  let inTranslate = false;
  let currentOld: string | null = null;

  for (const rawLine of text.split("\n")) {
    const s = rawLine.trim();
    if (/^translate \w+ strings:/.test(s)) {
      inTranslate = true;
      currentOld = null;
      continue;
    }
    if (inTranslate && s.startsWith("old ")) {
      if (currentOld !== null) pairs.push({ old: currentOld, new: null });
      const m = /^old "(.*)"$/.exec(s);
      currentOld = m ? _unescape(m[1]) : null;
      continue;
    }
    if (inTranslate && currentOld !== null && s.startsWith("new ")) {
      const m = /^new "(.*)"$/.exec(s);
      pairs.push({ old: currentOld, new: m ? _unescape(m[1]) : null });
      currentOld = null;
      continue;
    }
    if (inTranslate && s && !s.startsWith("old ") && !s.startsWith("new ") && !s.startsWith("#")) {
      inTranslate = false;
      currentOld = null;
    }
  }
  if (currentOld !== null) pairs.push({ old: currentOld, new: null });
  return pairs;
}

/**
 * Читает все пары из tl-каталога рекурсивно. При дубле old побеждает первое
 * вхождение (глобальная дедупликация, как в extract).
 * @param tlDir - каталог tl/<lang>/
 * @param filePrefix - префикс файловых путей в отчёте (относительно корня репы)
 */
export function readTlPairs(tlDir: string, filePrefix: string): PairMap {
  const map: PairMap = new Map();

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".rpy")) continue;
      const rel = filePrefix + "/" + relative(tlDir, full).split(sep).join("/");
      for (const p of parsePairs(readFileSync(full, "utf-8"))) {
        const key = norm(p.old);
        if (!map.has(key)) map.set(key, { old: p.old, new: p.new, file: rel });
      }
    }
  }

  walk(tlDir);
  return map;
}

/**
 * Читает пары из git-снимка tl-каталога (например patches/ai-voice-pack/tl/ru)
 * на указанный ref (HEAD, тег, коммит).
 * @param repoDir - корень git-репозитория
 * @param ref - git-ref
 * @param prefix - путь к tl внутри репы
 */
export function readGitPairs(repoDir: string, ref: string, prefix: string): PairMap {
  const map: PairMap = new Map();
  const files = execSync(`git ls-tree -r ${ref} --name-only -- ${prefix}`, {
    cwd: repoDir,
    encoding: "utf-8",
  })
    .split("\n")
    .map((s) => s.trim())
    .filter((f) => f.endsWith(".rpy"));

  for (const f of files) {
    let text: string;
    try {
      text = execSync(`git show ${ref}:${f}`, { cwd: repoDir, encoding: "utf-8", maxBuffer: 1 << 28 });
    } catch {
      continue;
    }
    for (const p of parsePairs(text)) {
      const key = norm(p.old);
      if (!map.has(key)) map.set(key, { old: p.old, new: p.new, file: f });
    }
  }
  return map;
}

/**
 * Скан игры -> множество нормализованных old (диалоги, UI, имена, define).
 * @param gameDir - каталог оригинальной игры (read-only)
 */
export function scanGameOlds(gameDir: string): Set<string> {
  const extractor = new RenPyExtractor(gameDir);
  const data = extractor.scan();
  const olds = new Set<string>();
  const collect = (original: string): void => {
    olds.add(norm(original));
  };
  for (const scenes of Object.values(data.arcs))
    for (const scene of Object.values(scenes)) for (const bd of Object.values(scene.blocks)) collect(bd.original);
  for (const blocks of Object.values(data.uiByFile)) for (const bd of blocks) collect(bd.original);
  for (const blocks of Object.values(data.charactersByFile)) for (const bd of blocks) collect(bd.original);
  for (const blocks of Object.values(data.definesByFile)) for (const bd of blocks) collect(bd.original);
  return olds;
}

/**
 * Чистая классификация (тестируется без git и файлов).
 * @param head - пары из git-ref снимка
 * @param work - пары из рабочей копии
 * @param gameOlds - нормализованные old скана игры
 */
export function classify(head: PairMap, work: PairMap, gameOlds: Set<string>): AuditResult {
  const dropped: PairInfo[] = [];
  for (const [key, pair] of head) if (!work.has(key)) dropped.push(pair);

  const added: PairInfo[] = [];
  for (const [key, pair] of work) if (!head.has(key)) added.push(pair);

  const notInGame: PairInfo[] = [];
  for (const [key, pair] of work) {
    if (pair.file.endsWith(ENGINE_FILE)) continue;
    if (!gameOlds.has(key)) notInGame.push(pair);
  }

  const missing: string[] = [];
  for (const old of gameOlds) if (!work.has(old)) missing.push(old);

  const lostTranslations = dropped.filter((d) => norm(d.new ?? "") !== norm(d.old) && gameOlds.has(norm(d.old)));

  return { gameOlds, dropped, added, notInGame, missing, lostTranslations };
}

/**
 * Форматирует человекочитаемый отчёт по результатам аудита.
 * @param result - результат classify
 * @param ref - использованный git-ref (для заголовка)
 */
export function formatReport(result: AuditResult, ref: string): string {
  const cut = (s: string | null, n = 70): string => JSON.stringify((s ?? "").slice(0, n));
  const L: string[] = [];

  L.push(`=== АУДИТ ПЕРЕВОДОВ (ref=${ref} vs рабочая копия vs игра) ===`);
  L.push(`game scan olds: ${result.gameOlds.size}`);
  L.push(`DROPPED (были в ${ref}, нет в рабочей): ${result.dropped.length}`);
  L.push(`  из них LOST_TRANS (перевод был, old ещё в игре — ПОТЕРЯ!): ${result.lostTranslations.length}`);
  L.push(`ADDED (появились в рабочей, не было в ${ref}): ${result.added.length}`);
  L.push(`NOTINGAME (в рабочей, но нет в скане игры): ${result.notInGame.length}`);
  L.push(`MISSING (в игре, но нет пары в рабочей): ${result.missing.length}`);
  L.push("");

  if (result.lostTranslations.length > 0) {
    L.push("--- LOST_TRANS (детально) ---");
    for (const d of result.lostTranslations) {
      L.push(`FILE ${d.file}`);
      L.push(`  old=${cut(d.old)} new_ref=${cut(d.new)}`);
    }
    L.push("");
  }

  if (result.dropped.length > 0) {
    L.push("--- DROPPED (классификация) ---");
    for (const d of result.dropped) {
      const inGame = result.gameOlds.has(norm(d.old)) ? "IN_GAME" : "gone";
      const wasTr = norm(d.new ?? "") !== norm(d.old) ? "was-translated" : "was-untranslated";
      L.push(`[${inGame}|${wasTr}] ${d.file} old=${cut(d.old)}`);
    }
    L.push("");
  }

  if (result.notInGame.length > 0) {
    L.push("--- NOTINGAME (пары в tl, которых нет в игре) ---");
    for (const n of result.notInGame) L.push(`${n.file} old=${cut(n.old, 60)}`);
    L.push("");
  }

  if (result.missing.length > 0) {
    L.push("--- MISSING (строки игры без пары в tl) ---");
    for (const m of result.missing.slice(0, 40)) L.push(`old=${cut(m, 80)}`);
    if (result.missing.length > 40) L.push(`... и ещё ${result.missing.length - 40}`);
  }

  return L.join("\n");
}

/**
 * CLI entry point.
 */
function main(): void {
  const args = process.argv.slice(2);
  const flagNames = new Set(["game", "tl", "ref", "lang"]);
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) continue;
    const name = a.slice(2);
    if (!flagNames.has(name)) {
      console.log("Unknown flag:", a);
      return;
    }
    const val = args[i + 1];
    if (val === undefined || val.startsWith("--")) {
      console.log("Flag --" + name + " requires a value");
      return;
    }
    flags[name] = val;
    i++;
  }

  const scriptDir = join(fileURLToPath(new URL(".", import.meta.url)));
  const projectRoot = join(scriptDir, "..", "..", "..");
  const lang = flags.lang ?? "ru";
  const gameDir = flags.game ?? join(projectRoot, "game");
  const tlDir = flags.tl ?? join(projectRoot, "patches", "ai-voice-pack", "tl", lang);
  const tlPrefix = relative(projectRoot, tlDir).split(sep).join("/");
  const ref = flags.ref ?? "HEAD";

  const head = readGitPairs(projectRoot, ref, tlPrefix);
  console.log(`${ref}-tl pairs: ${head.size}`);
  const work = readTlPairs(tlDir, tlPrefix);
  console.log(`work-tl pairs: ${work.size}`);
  const gameOlds = scanGameOlds(gameDir);

  const result = classify(head, work, gameOlds);
  console.log(formatReport(result, ref));

  const broken = result.lostTranslations.length + result.notInGame.length + result.missing.length;
  process.exitCode = broken > 0 ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
