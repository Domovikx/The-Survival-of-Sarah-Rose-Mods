/**
 * potgen.mts — EN-шаблон POT (template.pot) для TSSR из Ren'Py-исходников.
 *
 * Аналог NeonTranslator/potgen.py, но источник — не дамп Unity, а скрипты
 * игры <game>/game/*.rpy (по умолчанию Steam-установка TSSR, см. --game).
 * Единственный инструмент, который пишет po/template.pot; руками не править.
 *
 * Контексты (по аналогии с Neon, msgctxt дисамбигует одинаковые реплики):
 *   speaker:<Имя>  — реплика персонажа: define Display Name > строковое имя
 *                    > идентификатор, если define не найден;
 *   narration      — нарраторские строки (голые кавычки);
 *   menu           — варианты меню (пункт «выбора»);
 *   speaker-name   — имена персонажей (Character("Имя") / "Имя" "текст");
 *   ui             — интерфейсные _("...").
 *
 * Дедуп по (msgid, msgctxt): одна строка переводится один раз — реплики
 * «Hello» у Sarah и Kate живут раздельно (разные контексты), повторы того же
 * текста у того же спикера схлопываются. Сортировка по (msgid, msgctxt) —
 * стабильные дифы. Однострочные экранированные записи (как в Neon).
 *
 * Известные ограничения парсера (взяты из проверенных правил
 * renpy-extract/voice_catalog): многострочные реплики и python-блоки внутри
 * label не разбираются; строка вида `return "text"` станет спикером
 * «return» — на практике в игре не встречается.
 *
 * Запуск:
 *   node .opencode/skills/renpy-po/potgen.mts [--game DIR] [--out FILE]
 * Выход: patches/ai-voice-pack/po/template.pot
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { normalizeText, poEscape } from "./po_core.mts";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SKILL_DIR, "..", "..", "..");

/** Steam-установка TSSR (read-only источник строк). Переопределяется --game/TSSR_GAME. */
const DEFAULT_GAME =
  process.env.TSSR_GAME ?? "C:/Program Files (x86)/Steam/steamapps/common/The Survival of Sarah Rose/game";
const DEFAULT_OUT = join(REPO_ROOT, "patches", "ai-voice-pack", "po", "template.pot");

export const CTX_NARRATION = "narration";
export const CTX_MENU = "menu";
export const CTX_SPEAKER_NAME = "speaker-name";
export const CTX_UI = "ui";

export function speakerCtx(name: string): string {
  return `speaker:${name}`;
}

// ── Паттерны Ren'Py (порт voice_catalog.py: поддерживают экранированные
// кавычки внутри строк; гарды — из renpy-extract, фикс мусора парсера).
const RE_LABEL = /^label\s+([A-Za-z0-9_.]+)\s*:/;
const RE_DEFINE = /^define\s+(\w+)\s*=\s*Character\(\s*"([^"]+)"/;
const RE_MENU_START = /^menu\b/;
const RE_MENU_CHOICE = /^\s*"((?:[^"\\]|\\.)*)"\s*(?:if\b.*)?:\s*$/;
const RE_SAY_IDENT = /^\s*(\w+)\s+"((?:[^"\\]|\\.)*)"/;
const RE_SAY_QUOTED = /^\s*"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)"/;
const RE_NARR = /^\s*"((?:[^"\\]|\\.)*)"\s*(?:nointeract|with\b.*)?\s*$/;
const RE_IMAGE = /^image\s+\S.*:\s*$/;
const RE_UI = /_\("([^"]*)"\)/g;
const RE_UI_SINGLE = /_\('([^']*)'\)/g;

/** Декодирует экранирование строк Ren'Py (\" \n \\ и т.д.). */
export function rpyUnescape(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      const n = s[i + 1];
      out += n === "n" ? "\n" : n === "r" ? "\r" : n === "t" ? "\t" : n;
      i += 2;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** Одна запись шаблона. */
export interface PotEntry {
  msgid: string;
  msgctxt: string;
  n: number; // сколько раз встретилась в игре
}

export interface PotStats {
  files: number;
  scanned: number; // разобранных строк
  byContext: Record<string, number>; // уникальных записей по контекстам
  mergedDupes: number; // схлопнутых повторов (тот же msgid+msgctxt)
  normTwins: number; // семьи «похожих на нормаль» строк (будущий prefill)
  defines: number; // найденных define Character
}

export interface PotCatalog {
  entries: Map<string, PotEntry>; // ключ: `${msgctxt}\0${msgid}`
  stats: PotStats;
}

function entryKey(msgctxt: string, msgid: string): string {
  return `${msgctxt}\u0000${msgid}`;
}

/** Рекурсивно собирает .rpy файлы (мимо tl/ и скрытых каталогов), по возрастанию. */
export function collectRpyFiles(gameDir: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    let dirents;
    try {
      dirents = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      const full = join(dir, d.name);
      if (d.isDirectory()) {
        if (d.name === "tl" || d.name.startsWith(".")) continue;
        walk(full);
      } else if (d.isFile() && d.name.endsWith(".rpy")) {
        files.push(full);
      }
    }
  };
  walk(gameDir);
  return files.sort();
}

/**
 * Разбирает один .rpy файл: say/menu/нарратив/имена/UI-строки.
 *
 * Гарды (перенесены из renpy-extract, фикс 2026-10-19):
 *   sawLabel     — say/нарратив только внутри label (screen-вызовы
 *                  `text "..."` снаружи не парсятся);
 *   imageIndent  — внутри image/ATL-блоков кавычки — ассеты, не строки;
 *   inMenu       — пункты меню только пока отступлены.
 */
export function parseRpyFile(filePath: string, catalog: PotCatalog, defineDisplay: Record<string, string>): void {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return;
  }

  const add = (msgid: string, msgctxt: string): void => {
    if (!msgid) return;
    const key = entryKey(msgctxt, msgid);
    const slot = catalog.entries.get(key);
    if (slot) {
      slot.n += 1;
      catalog.stats.mergedDupes += 1;
    } else {
      catalog.entries.set(key, { msgid, msgctxt, n: 1 });
    }
  };

  const lines = content.split("\n");
  let sawLabel = false;
  let inMenu = false;
  let imageIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = raw.trim();
    if (!stripped || stripped.startsWith("#")) continue;
    catalog.stats.scanned += 1;
    const indent = (raw.match(/^[ \t]*/) ?? [""])[0].replace(/\t/g, "    ").length;
    if (imageIndent >= 0 && indent <= imageIndent) imageIndent = -1;

    // Label — граница «мы внутри сюжета».
    let m = RE_LABEL.exec(stripped);
    if (m) {
      sawLabel = true;
      inMenu = false;
      continue;
    }

    // Image/ATL-блок: тело не разбираем до выхода по отступу.
    if (RE_IMAGE.test(stripped)) {
      imageIndent = indent;
      continue;
    }

    // Меню: вход.
    if (RE_MENU_START.test(stripped)) {
      inMenu = true;
      continue;
    }

    // Меню: выход (дедент не-комментария).
    if (inMenu && !/^[ \t]/.test(raw)) inMenu = false;

    // define <id> = Character("Имя") — карта имён + запись speaker-name.
    m = RE_DEFINE.exec(stripped);
    if (m) {
      defineDisplay[m[1]] = m[2];
      catalog.stats.defines += 1;
      add(m[2], CTX_SPEAKER_NAME);
      continue;
    }

    // 1. Реплика с идентификатором: s "текст".
    m = RE_SAY_IDENT.exec(stripped);
    if (m && sawLabel && imageIndent < 0) {
      const text = rpyUnescape(m[2]);
      if (text && !text.startsWith("#")) {
        add(text, speakerCtx(defineDisplay[m[1]] ?? m[1]));
      }
      continue;
    }

    // 2. Реплика со строковым спикером: "Orc" "текст".
    m = RE_SAY_QUOTED.exec(stripped);
    if (m && sawLabel && imageIndent < 0) {
      const char = rpyUnescape(m[1]);
      const text = rpyUnescape(m[2]);
      if (text && !text.startsWith("#")) add(text, speakerCtx(char));
      if (char) add(char, CTX_SPEAKER_NAME);
      continue;
    }

    // 3. Нарратор: "текст".
    m = RE_NARR.exec(stripped);
    if (m && sawLabel && imageIndent < 0) {
      const text = rpyUnescape(m[1]);
      if (text) add(text, CTX_NARRATION);
      continue;
    }

    // 4. Пункт меню: "Выбор": (в т.ч. с условиями `if ...`).
    if (inMenu) {
      m = RE_MENU_CHOICE.exec(stripped);
      if (m) {
        const text = rpyUnescape(m[1].trim());
        if (text && text !== "Choose") add(text, CTX_MENU);
        continue;
      }
    }

    // 5. UI: _("...") catch-all.
    for (const re of [RE_UI, RE_UI_SINGLE]) {
      re.lastIndex = 0;
      let um: RegExpExecArray | null;
      while ((um = re.exec(stripped)) !== null) {
        if (um[1]) add(um[1], CTX_UI);
      }
    }
  }
}

/** Строит каталог POT по всем .rpy в gameDir. */
export function scanGame(gameDir: string): PotCatalog {
  const catalog: PotCatalog = {
    entries: new Map(),
    stats: {
      files: 0,
      scanned: 0,
      byContext: {},
      mergedDupes: 0,
      normTwins: 0,
      defines: 0,
    },
  };
  const defineDisplay: Record<string, string> = {};
  const files = collectRpyFiles(gameDir);
  catalog.stats.files = files.length;
  for (const f of files) parseRpyFile(f, catalog, defineDisplay);

  // Счётчики по контекстам + семьи «похожих» строк (для будущего prefill:
  // normalizeText-твин унаследует перевод ровно одного варианта).
  const byNorm = new Map<string, Set<string>>();
  for (const e of catalog.entries.values()) {
    const group = e.msgctxt.startsWith("speaker:") ? "dialogue" : e.msgctxt;
    catalog.stats.byContext[group] = (catalog.stats.byContext[group] ?? 0) + 1;
    const norm = normalizeText(e.msgid);
    if (!norm) continue;
    let fam = byNorm.get(norm);
    if (!fam) byNorm.set(norm, (fam = new Set()));
    fam.add(e.msgid);
  }
  catalog.stats.normTwins = [...byNorm.values()].filter((s) => s.size > 1).length;
  return catalog;
}

/** Рендерит каталог в текст template.pot (заголовок + записи, отсортированные). */
export function renderPot(catalog: PotCatalog, now: Date = new Date()): string {
  const ts = now.toISOString().slice(0, 16).replace("T", " ") + "+0000";
  const out: string[] = [
    "# TSSR EN template (generated by potgen.mts — do not edit).",
    "# Translate by copying to po/ru.po and filling msgstr.",
    'msgid ""',
    'msgstr ""',
    '"Project-Id-Version: TSSR-Mods 1.0\\n"',
    `"POT-Creation-Date: ${ts}\\n"`,
    '"Content-Type: text/plain; charset=UTF-8\\n"',
    '"Content-Transfer-Encoding: 8bit\\n"',
    "",
  ];
  const sorted = [...catalog.entries.values()].sort(
    (a, b) =>
      (a.msgid < b.msgid ? -1 : a.msgid > b.msgid ? 1 : 0) ||
      (a.msgctxt < b.msgctxt ? -1 : a.msgctxt > b.msgctxt ? 1 : 0),
  );
  for (const e of sorted) {
    out.push(`msgctxt "${poEscape(e.msgctxt)}"`);
    out.push(`msgid "${poEscape(e.msgid)}"`);
    out.push('msgstr ""');
    out.push("");
  }
  return out.join("\n").replace(/\n+$/, "") + "\n";
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("Usage: node potgen.mts [--game DIR] [--out FILE]");
    return;
  }
  const gameFlag = argv.indexOf("--game");
  const outFlag = argv.indexOf("--out");
  const gameDir = gameFlag >= 0 ? argv[gameFlag + 1] : DEFAULT_GAME;
  const outFile = outFlag >= 0 ? argv[outFlag + 1] : DEFAULT_OUT;
  if (!gameDir || !outFile) {
    console.error("ERROR: --game/--out требуют значение (см. --help)");
    process.exit(1);
  }

  const catalog = scanGame(gameDir);
  const s = catalog.stats;
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, renderPot(catalog), "utf-8");

  console.log(`POT: ${catalog.entries.size} уникальных записей из ${s.files} файлов -> ${outFile}`);
  console.log(`  разобрано строк: ${s.scanned}, define Character: ${s.defines}`);
  for (const [ctx, n] of Object.entries(s.byContext).sort()) {
    console.log(`  ${ctx}: ${n}`);
  }
  console.log(`  схлопнуто повторов (тот же msgid+msgctxt): ${s.mergedDupes}`);
  console.log(`  normalizeText-семей >1 варианта (кандидаты prefill): ${s.normTwins}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
