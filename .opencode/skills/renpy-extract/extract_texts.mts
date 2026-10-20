#!/usr/bin/env node

/**
 * @module extract_texts
 * @description Ren'Py Translation Extractor v4 — извлекает все переводимые строки
 * из game/ → .rpy файлы в tl/ru/
 *
 * Порядок проверок (важно!):
 *   1. dialogue   — character "text"
 *   2. narration  — "text"
 *   3. menu       — "Choice":
 *   4. character  — Character(_("Name"), ...)
 *   5. define     — define xxx = _("text")
 *   6. ui         — _("text")  (catch-all, последний)
 *
 * Требования:
 * - Node.js >= 18 (использует fs.readFileSync, fs.writeFileSync, fs.readdirSync,
 *   fs.existsSync, fs.mkdirSync, path.join, path.relative, crypto.createHash)
 * - Никаких внешних зависимостей — только встроенные модули
 *
 * Использование:
 *   node extract_texts.mts <command> [lang] [options]
 *   extract            Scan game/ -> .rpy в tl/<lang>/
 *   extract-builtins   Scan Ren'Py engine built-in strings
 *   verify             Check game/ vs tl/<lang>/
 *   stats              Show translation statistics
 *   options: --game <dir> --tl <dir> --lang <code>
 *
 * @see {@link https://nodejs.org/docs/latest-v18.x/api/fs.html|Node.js fs docs}
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const VERSION = 4;

export const ARC_PATTERNS: Array<[RegExp, string]> = [
  [/^Opening/, "Prologue"],
  [
    /^(DayOfTheFuneral|SecondPartOfFuneral|MeetingOnTheBattlements|MeetingKateInTheGarden|SarahsBedroomAfterFuneral|TheMorningAfterKate|SarahAndThomasSpeak|TheInsidePathBegins|ChooseThePath|CoronationDay)/,
    "StoryBeginnings",
  ],
  [/^Union(Kingdom|Loop|Decision)/, "UnionKingdom"],
  [/^Warrior(Path|Queen|Rahayal)/, "WarriorPath"],
  [/^SailorPath/, "SailorPath"],
  [/^MagePath/, "MagePath"],
  [/^(Hassar|Jaeid)Path/, "HassarPath"],
  [/^Sakar/, "SakarPath"],
  [/^(CampSlave|Unmarried|MariusMarriage|GallowCreek)/, "AlfredArc"],
  [/^DemonArc/, "DemonArc"],
  [/^(The)?BlackMonolith/, "BlackMonolith"],
  [/^TheHollowWorld/, "HollowWorld"],
  [/^(TrainingPath|ChoosingAMentor|GeneralPathBegins)/, "Training"],
  [/^(Varga|Marion)Path/, "VargaMarionPath"],
  [/^(HyralGoblin|HyralOrc|HyralTown)/, "HyralArc"],
  [/^(SarahAndNick|LifeInRahayal|ServantOfGilead|TailorRoute)/, "LifeInRahayal"],
  [/^(OutsideAndAlone|PrisonPath|UnderworldPath)/, "PrisonArc"],
  [/^(TheOldRoad|SarahLeaves|SarahExplores)/, "SailorArc"],
  [/^(TheBattleForTheCapital|WarCouncil)/, "WarArc"],
  [/^(MageInTheRuins|FallOfLethram)/, "MagePath"],
];

/**
 * MD5 хэш (первые 8 символов).
 */
export function _hash(text: string): string {
  return createHash("md5").update(text, "utf-8").digest("hex").slice(0, 8);
}

/**
 * Экранирование для old/new строк в .rpy.
 */
export function _esc(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Обратное экранирование из .rpy формата.
 */
export function _unescape(text: string): string {
  const result: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.slice(i, i + 2) === "\\\\") {
      result.push("\\");
      i += 2;
    } else if (text.slice(i, i + 2) === '\\"') {
      result.push('"');
      i += 2;
    } else {
      result.push(text[i]);
      i++;
    }
  }
  return result.join("");
}

/**
 * Собирает old строки из всех .rpy файлов в tlDir (кроме exclude).
 */
export function _collectOldStringsInTl(tlDir: string, exclude?: string): Set<string> {
  const olds = new Set<string>();

  function walk(dir: string): void {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".rpy")) {
        if (exclude && entry.name === exclude) continue;
        try {
          const content = readFileSync(fullPath, "utf-8");
          for (const line of content.split("\n")) {
            const s = line.trim();
            if (s.startsWith("old ")) {
              const m = /^old "(.*)"\s*$/.exec(s);
              if (m) {
                olds.add(_unescape(m[1]).trim());
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }
  }

  walk(tlDir);
  return olds;
}

/**
 * Находит директорию Ren'Py SDK common/.
 */
export function _findRenpyCommonDir(projectRoot: string): string | null {
  const candidates = [join(projectRoot, "renpy", "common"), join(projectRoot, "renpy-8.5.2-sdk", "renpy", "common")];

  for (const c of candidates) {
    if (existsSync(c) && has00Files(c)) return c;
  }

  const parent = join(projectRoot, "..");
  let entries: string[];
  try {
    entries = readdirSync(parent);
  } catch {
    return null;
  }

  for (const name of entries.sort()) {
    if (name.startsWith("renpy")) {
      const c = join(parent, name, "renpy", "common");
      if (existsSync(c) && has00Files(c)) return c;
    }
  }

  return null;

  function has00Files(dir: string): boolean {
    try {
      return readdirSync(dir).some((e) => e.startsWith("00") && e.endsWith(".rpy"));
    } catch {
      return false;
    }
  }
}

/**
 * Один переводимый блок (строка).
 */
export interface BlockEntry {
  id: string;
  original: string;
  translated: string;
  type: string;
  character?: string | null;
  sourceFile: string;
  sourceLine: number;
}

interface ArcScene {
  sourceFile: string;
  sourceLine: number;
  blocks: Record<string, BlockEntry>;
}

interface ExtractMeta {
  version: number;
  extractedAt: string;
  totalArcBlocks: number;
  totalUiStrings: number;
  totalCharacterNames: number;
  totalDefineStrings: number;
  arcsCount: number;
}

interface ExtractResult {
  meta: ExtractMeta;
  arcs: Record<string, Record<string, ArcScene>>;
  uiByFile: Record<string, BlockEntry[]>;
  charactersByFile: Record<string, BlockEntry[]>;
  definesByFile: Record<string, BlockEntry[]>;
}

export class RenPyExtractor {
  gameDir: string;
  arcs: Record<string, Record<string, ArcScene>>;
  uiBlocks: Record<string, BlockEntry>;
  characterBlocks: Record<string, BlockEntry>;
  defineBlocks: Record<string, BlockEntry>;
  _seenOriginals: Set<string>;
  _existingTranslations: Record<string, string>;

  constructor(gameDir: string) {
    this.gameDir = gameDir;
    this.arcs = {};
    this.uiBlocks = {};
    this.characterBlocks = {};
    this.defineBlocks = {};
    this._seenOriginals = new Set();
    this._existingTranslations = {};
  }

  static _norm(text: string): string {
    return text.trim();
  }

  _getArc(label: string): string {
    for (const [pattern, arcName] of ARC_PATTERNS) {
      if (pattern.test(label)) {
        return arcName;
      }
    }
    return "Other";
  }

  /**
   * Читает существующие .rpy файлы в tl/<lang>/ и извлекает переводы.
   * Строки с new == old не сохраняются (считаются непереведёнными) —
   * это осознанно: verify честно показывает их остатком.
   */
  setExistingTranslations(tlDir: string, lang = "ru"): void {
    const existing: Record<string, string> = {};
    if (!existsSync(tlDir)) return;

    function walk(dir: string): void {
      let entries: Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".rpy")) {
          try {
            const content = readFileSync(fullPath, "utf-8");
            let inTranslate = false;
            let currentOrig: string | null = null;
            for (const line of content.split("\n")) {
              const s = line.trim();
              if (s.startsWith(`translate ${lang} strings:`)) {
                inTranslate = true;
                currentOrig = null;
                continue;
              }
              if (inTranslate && s.startsWith("old ")) {
                const m = /^old "(.*)"\s*$/.exec(s);
                if (m) {
                  currentOrig = _unescape(m[1]);
                }
                continue;
              }
              if (inTranslate && currentOrig !== null && s.startsWith("new ")) {
                const m = /^new "(.*)"\s*$/.exec(s);
                if (m) {
                  const trans = _unescape(m[1]);
                  if (trans && trans !== currentOrig) {
                    existing[RenPyExtractor._norm(currentOrig)] = trans;
                  }
                }
                currentOrig = null;
                continue;
              }
              if (inTranslate && s && !s.startsWith("old ") && !s.startsWith("new ") && !s.startsWith("#")) {
                inTranslate = false;
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }

    walk(tlDir);
    this._existingTranslations = existing;
  }

  _existing(original: string): string {
    return this._existingTranslations[RenPyExtractor._norm(original)] || "";
  }

  _dedupKey(text: string): string {
    return text.trim();
  }

  /**
   * Парсит один .rpy файл и добавляет найденные строки.
   */
  parseFile(filePath: string): void {
    const sourceFile = filePath;
    const fileName = filePath.split(/[\\/]/).pop() ?? "";
    let currentLabel = fileName.replace(/\.rpy$/, "");
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      try {
        content = readFileSync(filePath, "latin1");
      } catch {
        return;
      }
    }

    const lines = content.split("\n");
    let inMenu = false;
    // Вне label (init python, screen-без-label) и внутри image/ATL-блоков
    // находятся идентификаторы/пути/атрибуты, а не переводимые строки —
    // SAY/NARR-матчеры их не трогают (фикс мусора парсера, 2026-10-19).
    let sawLabel = false;
    let imageIndent = -1;

    for (let i = 0; i < lines.length; i++) {
      const stripped = lines[i].trim();
      if (!stripped) continue;

      const indent = (lines[i].match(/^[ \t]*/) ?? [""])[0].replace(/\t/g, "    ").length;
      if (imageIndent >= 0 && indent <= imageIndent) imageIndent = -1;
      if (/^image\s+\S.*:\s*$/.test(stripped)) {
        imageIndent = indent;
      }

      // Label
      let m = /^label\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:/.exec(stripped);
      if (m) {
        currentLabel = m[1];
        sawLabel = true;
        inMenu = false;
        continue;
      }

      // Menu start
      if (/^menu\b/.test(stripped)) {
        inMenu = true;
        continue;
      }

      // Выход из menu context
      if (inMenu && lines[i][0] !== " " && lines[i][0] !== "\t" && !stripped.startsWith("#")) {
        inMenu = false;
      }

      // ── 1. Диалог: character "text" ── (только внутри label)
      m = /^([a-zA-Z_][a-zA-Z0-9_]*)\s+"(.+)"\s*$/.exec(stripped);
      if (m && sawLabel && imageIndent < 0) {
        const char = m[1];
        const text = _unescape(m[2]);
        if (text && !text.startsWith("#")) {
          this._addToArc(this._getArc(currentLabel), currentLabel, sourceFile, i + 1, text, "dialogue", char);
        }
        continue;
      }

      // ── 2. Диалог в кавычках: "Character" "text" ── (только внутри label)
      m = /^"([^"]+)"\s+"(.+)"\s*$/.exec(stripped);
      if (m && sawLabel && imageIndent < 0) {
        const char = _unescape(m[1]);
        const text = _unescape(m[2]);
        if (text && !text.startsWith("#")) {
          this._addToArc(this._getArc(currentLabel), currentLabel, sourceFile, i + 1, text, "dialogue", char);
        }
        if (char) {
          const dk = this._dedupKey(char);
          if (!this._seenOriginals.has(dk)) {
            this._seenOriginals.add(dk);
            this.characterBlocks[dk] = {
              id: `char_${_hash(`${sourceFile}:${i + 1}:char:${char}`)}`,
              original: char,
              translated: this._existing(char),
              type: "character_name",
              character: null,
              sourceFile,
              sourceLine: i + 1,
            };
          }
        }
        continue;
      }

      // ── 3. Нарратив: "text" ── (только внутри label и вне image-блоков)
      m = /^"(.+)"\s*$/.exec(stripped);
      if (m && sawLabel && imageIndent < 0 && !stripped.startsWith("menu")) {
        const text = _unescape(m[1]);
        this._addToArc(this._getArc(currentLabel), currentLabel, sourceFile, i + 1, text, "narration", null);
        continue;
      }

      // ── 4. Menu choice: "Choice": ──
      m = /^\s*"(.+?)"\s*:\s*$/.exec(stripped);
      if (m && inMenu) {
        const text = _unescape(m[1].trim());
        if (text && text !== "Choose") {
          this._addToArc(this._getArc(currentLabel), currentLabel, sourceFile, i + 1, text, "menu_choice", null);
        }
        continue;
      }

      // ── 5. Character definition ──
      let combined = stripped;
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const nxt = lines[j].trim();
        if (nxt && !nxt.startsWith("#")) {
          combined += " " + nxt;
          const opens = (combined.match(/\(/g) || []).length;
          const closes = (combined.match(/\)/g) || []).length;
          if (opens <= closes) break;
        }
      }

      let charMatch = /Character\(_\("([^"]+)"\)/.exec(combined);
      if (!charMatch) charMatch = /Character\("([^"]+)"\)/.exec(combined);
      if (charMatch) {
        const name = charMatch[1];
        const dk = this._dedupKey(name);
        if (!this._seenOriginals.has(dk)) {
          this._seenOriginals.add(dk);
          this.characterBlocks[dk] = {
            id: `char_${_hash(`${sourceFile}:${i + 1}:char:${name}`)}`,
            original: name,
            translated: this._existing(name),
            type: "character_name",
            character: null,
            sourceFile,
            sourceLine: i + 1,
          };
        }
        continue;
      }

      // ── 6. Define: define config.name = _("text") ──
      if (/^(define|default)\s+/.test(stripped)) {
        const skip = new Set([
          "Back",
          "History",
          "Skip",
          "Auto",
          "Save",
          "Q.Save",
          "Q.Load",
          "Prefs",
          "Hide UI",
          "Start",
          "Load",
          "Settings",
          "End Replay",
          "Main Menu",
          "Quit",
          "Return",
        ]);
        const re = /_\(p?"([^"]+)"\)/g;
        let dm: RegExpExecArray | null;
        while ((dm = re.exec(stripped)) !== null) {
          const text = dm[1];
          if (text && !skip.has(text)) {
            const dk = this._dedupKey(text);
            if (!this._seenOriginals.has(dk)) {
              this._seenOriginals.add(dk);
              this.defineBlocks[dk] = {
                id: `def_${_hash(`${sourceFile}:${i + 1}:def:${text}`)}`,
                original: text,
                translated: this._existing(text),
                type: "define_string",
                character: null,
                sourceFile,
                sourceLine: i + 1,
              };
            }
          }
        }
        continue;
      }

      // ── 7. UI: _("text") — catch-all ──
      const uiRE = /_\("([^"]+)"\)/g;
      let um: RegExpExecArray | null;
      while ((um = uiRE.exec(stripped)) !== null) {
        const text = um[1];
        if (text) {
          const dk = this._dedupKey(text);
          if (!this._seenOriginals.has(dk)) {
            this._seenOriginals.add(dk);
            this.uiBlocks[dk] = {
              id: `ui_${_hash(`${sourceFile}:${i + 1}:ui:${text}`)}`,
              original: text,
              translated: this._existing(text),
              type: "ui_string",
              character: null,
              sourceFile,
              sourceLine: i + 1,
            };
          }
        }
      }

      const uiSingleRE = /_\('([^']+)'\)/g;
      let us: RegExpExecArray | null;
      while ((us = uiSingleRE.exec(stripped)) !== null) {
        const text = us[1];
        if (text) {
          const dk = this._dedupKey(text);
          if (!this._seenOriginals.has(dk)) {
            this._seenOriginals.add(dk);
            this.uiBlocks[dk] = {
              id: `ui_${_hash(`${sourceFile}:${i + 1}:ui:${text}`)}`,
              original: text,
              translated: this._existing(text),
              type: "ui_string",
              character: null,
              sourceFile,
              sourceLine: i + 1,
            };
          }
        }
      }
    }
  }

  _addToArc(
    arcName: string,
    sceneName: string,
    sourceFile: string,
    sourceLine: number,
    original: string,
    blockType: string,
    character: string | null,
  ): void {
    const dk = this._dedupKey(original);
    if (this._seenOriginals.has(dk)) return;
    this._seenOriginals.add(dk);

    if (!this.arcs[arcName]) this.arcs[arcName] = {};
    if (!this.arcs[arcName][sceneName]) {
      this.arcs[arcName][sceneName] = { sourceFile, sourceLine, blocks: {} };
    }
    this.arcs[arcName][sceneName].blocks[dk] = {
      id: `${sceneName}_${_hash(`${sourceFile}:${sourceLine}:${blockType}:${original}`)}`,
      original,
      translated: this._existing(original),
      type: blockType,
      character,
      sourceFile,
      sourceLine,
    };
  }

  /**
   * Scan Ren'Py common/ directory for _("text") built-in strings.
   */
  scanEngineBuiltins(renpyCommonDir: string): BlockEntry[] {
    const engineBlocks: Record<string, BlockEntry> = {};
    const commonFiles: string[] = [];

    try {
      const entries = readdirSync(renpyCommonDir, { withFileTypes: true });
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isFile() && entry.name.startsWith("00") && entry.name.endsWith(".rpy")) {
          commonFiles.push(join(renpyCommonDir, entry.name));
        }
      }
    } catch {
      // ignore
    }

    console.log(`Scanning engine built-ins in ${renpyCommonDir}...`);
    console.log(`Found ${commonFiles.length} common files\n`);

    for (const f of commonFiles) {
      let content: string;
      try {
        content = readFileSync(f, "utf-8");
      } catch {
        try {
          content = readFileSync(f, "latin1");
        } catch {
          continue;
        }
      }

      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const re = /_\("([^"]+)"\)/g;
        const stripped = lines[i].trim();
        let m: RegExpExecArray | null;
        while ((m = re.exec(stripped)) !== null) {
          const text = m[1];
          if (text) {
            const dk = this._dedupKey(text);
            if (!this._seenOriginals.has(dk) && !engineBlocks[dk]) {
              const projRoot = join(renpyCommonDir, "..", "..");
              const relFile = relative(projRoot, f).split(sep).join("/");
              engineBlocks[dk] = {
                id: `engine_${_hash(`${entryName(f)}:${i + 1}:${text}`)}`,
                original: text,
                translated: this._existing(text),
                type: "engine_string",
                sourceFile: relFile,
                sourceLine: i + 1,
              };
            }
          }
        }
      }
    }

    console.log(`  Engine built-in strings: ${Object.keys(engineBlocks).length}`);
    return Object.values(engineBlocks);
  }

  /**
   * Основной метод сканирования.
   */
  scan(): ExtractResult {
    const files: string[] = [];

    function walk(dir: string): void {
      let entries: Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "tl") continue;
          if (entry.name.startsWith(".")) continue;
          walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".rpy")) {
          files.push(fullPath);
        }
      }
    }

    walk(this.gameDir);
    files.sort();

    console.log(`Scanning ${this.gameDir}...`);
    console.log(`Found ${files.length} .rpy files\n`);

    for (const f of files) {
      console.log(`  Parsing: ${entryName(f)}`);
      this.parseFile(f);
    }

    const totalArc = Object.values(this.arcs).reduce(
      (sum, scenes) => sum + Object.values(scenes).reduce((s, scene) => s + Object.keys(scene.blocks).length, 0),
      0,
    );

    console.log(`\n${"=".repeat(50)}`);
    console.log(`  Arc blocks:       ${totalArc}`);
    console.log(`  UI strings:       ${Object.keys(this.uiBlocks).length}`);
    console.log(`  Character names:  ${Object.keys(this.characterBlocks).length}`);
    console.log(`  Define strings:   ${Object.keys(this.defineBlocks).length}`);
    console.log(`  Arcs:             ${Object.keys(this.arcs).length}`);
    console.log(`${"=".repeat(50)}`);

    return this._buildResult();
  }

  _buildResult(): ExtractResult {
    const uiByFile: Record<string, BlockEntry[]> = {};
    const charByFile: Record<string, BlockEntry[]> = {};
    const defineByFile: Record<string, BlockEntry[]> = {};

    for (const [, b] of Object.entries(this.uiBlocks)) {
      const sf = b.sourceFile;
      if (!uiByFile[sf]) uiByFile[sf] = [];
      uiByFile[sf].push(b);
    }
    for (const [, b] of Object.entries(this.characterBlocks)) {
      const sf = b.sourceFile;
      if (!charByFile[sf]) charByFile[sf] = [];
      charByFile[sf].push(b);
    }
    for (const [, b] of Object.entries(this.defineBlocks)) {
      const sf = b.sourceFile;
      if (!defineByFile[sf]) defineByFile[sf] = [];
      defineByFile[sf].push(b);
    }

    const totalArcBlocks = Object.values(this.arcs).reduce(
      (sum, scenes) => sum + Object.values(scenes).reduce((s, scene) => s + Object.keys(scene.blocks).length, 0),
      0,
    );

    return {
      meta: {
        version: VERSION,
        extractedAt: new Date().toISOString(),
        totalArcBlocks,
        totalUiStrings: Object.keys(this.uiBlocks).length,
        totalCharacterNames: Object.keys(this.characterBlocks).length,
        totalDefineStrings: Object.keys(this.defineBlocks).length,
        arcsCount: Object.keys(this.arcs).length,
      },
      arcs: this.arcs,
      uiByFile,
      charactersByFile: charByFile,
      definesByFile: defineByFile,
    };
  }
}

/**
 * Получить имя файла из пути.
 */
function entryName(path: string): string {
  return path.split(/[\\/]/).pop() ?? "";
}

/**
 * Генерация .rpy файлов переводов из данных.
 */
export function generateRpy(data: ExtractResult, outputDir: string, lang = "ru"): string[] {
  const generated: string[] = [];

  // Arc files
  for (const [arcName, scenes] of Object.entries(data.arcs || {})) {
    for (const [sceneName, scene] of Object.entries(scenes)) {
      const sf = scene.sourceFile || "unknown";
      const outDir = join(outputDir, arcName);
      const out = join(outDir, `${sceneName}.rpy`);

      const blocks = scene.blocks || {};
      if (Object.keys(blocks).length === 0) continue;

      let content = "# -*- encoding: utf-8 -*-\n";
      content += `# Arc: ${arcName} | Scene: ${sceneName}\n`;
      content += `# Source: ${sf}\n\n`;
      content += `translate ${lang} strings:\n\n`;
      for (const [, bd] of Object.entries(blocks)) {
        const o = _esc(bd.original || "");
        const tRaw = bd.translated || "";
        const t = _esc(tRaw || bd.original || "");
        content += `    old "${o}"\n`;
        content += `    new "${t}"\n\n`;
      }

      try {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(out, content, "utf-8");
      } catch (e) {
        console.error(`  [ERROR] Cannot write ${out}: ${(e as Error).message}`);
      }

      generated.push(relative(outputDir, out).split(sep).join("/"));
    }
  }

  // UI strings → screens.rpy
  const uiData = data.uiByFile || {};
  if (Object.keys(uiData).length > 0) {
    const out = join(outputDir, "screens.rpy");
    const allBlocks: BlockEntry[] = [];
    for (const blocks of Object.values(uiData)) {
      for (const b of blocks) allBlocks.push(b);
    }
    allBlocks.sort((a, b) => a.original.toLowerCase().localeCompare(b.original.toLowerCase()));

    let content = "# -*- encoding: utf-8 -*-\n";
    content += "# UI Strings - Buttons, Menus, etc.\n\n";
    content += `translate ${lang} strings:\n\n`;
    for (const bd of allBlocks) {
      const o = _esc(bd.original || "");
      const tRaw = bd.translated || "";
      const t = _esc(tRaw || bd.original || "");
      content += `    old "${o}"\n`;
      content += `    new "${t}"\n\n`;
    }

    try {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(out, content, "utf-8");
    } catch (e) {
      console.error(`  [ERROR] Cannot write ${out}: ${(e as Error).message}`);
    }
    generated.push("screens.rpy");
  }

  // Characters + Defines → misc_strings.rpy
  const extraBlocks: BlockEntry[] = [];
  for (const blocks of Object.values(data.charactersByFile || {})) {
    for (const b of blocks) extraBlocks.push(b);
  }
  for (const blocks of Object.values(data.definesByFile || {})) {
    for (const b of blocks) extraBlocks.push(b);
  }

  if (extraBlocks.length > 0) {
    extraBlocks.sort((a, b) => a.original.toLowerCase().localeCompare(b.original.toLowerCase()));
    const out = join(outputDir, "misc_strings.rpy");

    let content = "# -*- encoding: utf-8 -*-\n";
    content += "# Character names + Define strings\n\n";
    content += `translate ${lang} strings:\n\n`;
    for (const bd of extraBlocks) {
      const o = _esc(bd.original || "");
      const tRaw = bd.translated || "";
      const t = _esc(tRaw || bd.original || "");
      content += `    old "${o}"\n`;
      content += `    new "${t}"\n\n`;
    }

    try {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(out, content, "utf-8");
    } catch (e) {
      console.error(`  [ERROR] Cannot write ${out}: ${(e as Error).message}`);
    }
    generated.push("misc_strings.rpy");
  }

  console.log(`\nGenerated ${generated.length} .rpy files in ${outputDir}`);
  return generated;
}

/**
 * Генерация renpy_common.rpy с built-in строками движка.
 *
 * Переводы берутся (в порядке приоритета):
 * 1. existingTranslations (из всех tl/ru/ файлов)
 * 2. существующий renpy_common.rpy на диске
 * 3. оригинальный текст (fallback)
 *
 * Пропускает old строки, которые уже есть в других tl/ru/ .rpy файлах.
 */
export function generateEngineRpy(
  engineBlocks: BlockEntry[],
  tlDir: string,
  existingTranslations?: Record<string, string>,
  lang = "ru",
): string[] {
  if (!engineBlocks || engineBlocks.length === 0) return [];

  const existingOlds = _collectOldStringsInTl(tlDir, "renpy_common.rpy");

  let skipped = 0;
  const filtered: BlockEntry[] = [];
  for (const bd of engineBlocks) {
    const origText = bd.original.trim();
    if (existingOlds.has(origText)) {
      skipped++;
      continue;
    }
    filtered.push(bd);
  }

  if (filtered.length === 0) {
    console.log("  All engine built-in strings already exist in other tl/ru/ files, nothing to generate.");
    return [];
  }

  if (skipped > 0) {
    console.log(`  Skipped ${skipped} string(s) already present in other tl/ru/ files`);
  }

  engineBlocks = filtered;
  engineBlocks.sort((a, b) => a.original.toLowerCase().localeCompare(b.original.toLowerCase()));
  const out = join(tlDir, "renpy_common.rpy");
  const generated = ["renpy_common.rpy"];

  const existingFromFile: Record<string, string> = {};
  if (existsSync(out)) {
    try {
      const content = readFileSync(out, "utf-8");
      let inTranslate = false;
      let currentOrig: string | null = null;
      for (const line of content.split("\n")) {
        const s = line.trim();
        if (s.startsWith(`translate ${lang} strings:`)) {
          inTranslate = true;
          currentOrig = null;
          continue;
        }
        if (inTranslate && s.startsWith("old ")) {
          const m = /^old "(.*)"\s*$/.exec(s);
          if (m) {
            currentOrig = _unescape(m[1]);
          }
          continue;
        }
        if (inTranslate && currentOrig && s.startsWith("new ")) {
          const m = /^new "(.*)"\s*$/.exec(s);
          if (m) {
            const t = _unescape(m[1]);
            if (t && t !== currentOrig) {
              existingFromFile[currentOrig.trim()] = t;
            }
          }
          currentOrig = null;
          continue;
        }
        if (inTranslate && s && !s.startsWith("old ") && !s.startsWith("new ") && !s.startsWith("#")) {
          inTranslate = false;
        }
      }
    } catch {
      // ignore
    }
  }

  let content = "# -*- encoding: utf-8 -*-\n";
  content += "# Ren'Py Engine Built-in Strings\n";
  content += "# Extracted from renpy/common/00*.rpy\n\n";
  content += `translate ${lang} strings:\n\n`;
  for (const bd of engineBlocks) {
    const o = _esc(bd.original || "");
    const origText = bd.original.trim();
    let tRaw = "";
    if (existingTranslations && origText in existingTranslations) {
      tRaw = existingTranslations[origText];
    } else if (origText in existingFromFile) {
      tRaw = existingFromFile[origText];
    }
    const t = _esc(tRaw || bd.original || "");
    content += `    # Source: ${bd.sourceFile || ""}:${bd.sourceLine || ""}\n`;
    content += `    old "${o}"\n`;
    content += `    new "${t}"\n\n`;
  }

  try {
    mkdirSync(tlDir, { recursive: true });
    writeFileSync(out, content, "utf-8");
  } catch (e) {
    console.error(`  [ERROR] Cannot write ${out}: ${(e as Error).message}`);
  }

  return generated;
}

/**
 * Удаление built-in confirm строк из screens.rpy если они есть в renpy_common.rpy.
 */
export function _cleanEngineDuplicatesFromScreens(tlDir: string): void {
  const screensPath = join(tlDir, "screens.rpy");
  const commonPath = join(tlDir, "renpy_common.rpy");
  if (!existsSync(screensPath) || !existsSync(commonPath)) return;

  const commonOlds = new Set<string>();
  try {
    const content = readFileSync(commonPath, "utf-8");
    for (const line of content.split("\n")) {
      const s = line.trim();
      if (s.startsWith("old ")) {
        const m = /^old "(.*)"\s*$/.exec(s);
        if (m) commonOlds.add(m[1]);
      }
    }
  } catch {
    return;
  }

  if (commonOlds.size === 0) return;

  let content: string;
  try {
    content = readFileSync(screensPath, "utf-8");
  } catch {
    return;
  }

  const lines = content.split("\n");
  const newLines: string[] = [];
  let skipNext = false;
  let removed = 0;

  for (const line of lines) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    const s = line.trim();
    if (s.startsWith("old ")) {
      const m = /^old "(.*)"\s*$/.exec(s);
      if (m && commonOlds.has(m[1])) {
        skipNext = true;
        removed++;
        continue;
      }
    }
    newLines.push(line);
  }

  if (removed > 0) {
    writeFileSync(screensPath, newLines.join("\n"), "utf-8");
    console.log(`  Removed ${removed} duplicate built-in string(s) from screens.rpy`);
  }
}

/**
 * Подсчёт переведённых строк в renpy_common.rpy.
 */
export function countEngineTranslations(tlDir: string, lang = "ru"): [number, number] {
  const f = join(tlDir, "renpy_common.rpy");
  if (!existsSync(f)) return [0, 0];

  let total = 0;
  let done = 0;

  try {
    const content = readFileSync(f, "utf-8");
    let inTranslate = false;
    let currentOrig: string | null = null;

    for (const line of content.split("\n")) {
      const s = line.trim();
      if (s.startsWith(`translate ${lang} strings:`)) {
        inTranslate = true;
        continue;
      }
      if (inTranslate && s.startsWith("old ")) {
        const m = /^old "(.*)"\s*$/.exec(s);
        if (m) {
          currentOrig = _unescape(m[1]);
          total++;
        }
        continue;
      }
      if (inTranslate && currentOrig && s.startsWith("new ")) {
        const m = /^new "(.*)"\s*$/.exec(s);
        if (m) {
          const t = _unescape(m[1]);
          if (t && t !== currentOrig) done++;
        }
        currentOrig = null;
        continue;
      }
      if (inTranslate && s && !s.startsWith("old ") && !s.startsWith("new ") && !s.startsWith("#")) {
        inTranslate = false;
      }
    }
  } catch {
    // ignore
  }

  return [total, done];
}

/**
 * Проверка целостности: game/ vs tl/<lang>/.
 */
export function verifyIntegrity(
  originalDir: string,
  tlDir: string,
  renpyCommonDir?: string,
  lang = "ru",
): [number, number] {
  const extractor = new RenPyExtractor(originalDir);
  extractor.setExistingTranslations(tlDir, lang);
  const data = extractor.scan();

  let total = 0;
  let done = 0;

  for (const arc of Object.values(data.arcs)) {
    for (const scene of Object.values(arc)) {
      for (const bd of Object.values(scene.blocks)) {
        total++;
        if (bd.translated) done++;
      }
    }
  }

  for (const blocks of Object.values(data.uiByFile)) {
    for (const bd of blocks) {
      total++;
      if (bd.translated) done++;
    }
  }

  for (const blocks of Object.values(data.charactersByFile)) {
    for (const bd of blocks) {
      total++;
      if (bd.translated) done++;
    }
  }

  for (const blocks of Object.values(data.definesByFile)) {
    for (const bd of blocks) {
      total++;
      if (bd.translated) done++;
    }
  }

  const [engineTotal, engineDone] = countEngineTranslations(tlDir, lang);
  if (engineTotal > 0) {
    total += engineTotal;
    done += engineDone;
  }

  const pct = total > 0 ? ((100 * done) / total).toFixed(1) : "0.0";
  console.log();
  console.log("=".repeat(40));
  console.log("  Integrity Check");
  console.log("=".repeat(40));
  console.log(`  Total strings:  ${total}`);
  console.log(`  Translated:     ${done}`);
  console.log(`  Untranslated:   ${total - done}`);
  console.log(`  Progress:       ${pct}%`);
  if (engineTotal > 0) {
    console.log(
      `  Engine builtins: ${engineTotal} (${engineTotal > 0 ? Math.floor((100 * engineDone) / engineTotal) : 0}%)`,
    );
  }
  console.log("=".repeat(40));

  return [total, done];
}

/**
 * CLI entry point.
 */
function main(): void {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log("Commands:");
    console.log("  extract           Scan game/ -> .rpy in tl/ru/");
    console.log("  extract-builtins  Scan Ren'Py engine built-in strings");
    console.log("  verify            Check game/ vs tl/<lang>/");
    console.log("  stats             Show translation statistics");
    console.log("");
    console.log("Usage: extract_texts.mts <command> [lang] [options]");
    console.log("  lang                 Translation language (default: ru, or --lang)");
    console.log("  --game <dir>         Game/ directory to scan (default: <project>/game)");
    console.log("  --tl <dir>           Target tl directory (default: <project>/game/tl/<lang>)");
    return;
  }

  // Parse: <cmd> [lang] [--flag value ...]
  const flagNames = new Set(["game", "tl", "lang"]);
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
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
    } else {
      positional.push(a);
    }
  }

  const cmd = args[0];
  const lang = flags.lang ?? positional[0] ?? "ru";
  const scriptDir = join(fileURLToPath(new URL(".", import.meta.url)));
  const projectRoot = join(scriptDir, "..", "..", "..");
  const gameDir = flags.game ?? join(projectRoot, "game");
  const tlDir = flags.tl ?? join(projectRoot, "game", "tl", lang);

  if (cmd === "extract") {
    const extractor = new RenPyExtractor(gameDir);
    extractor.setExistingTranslations(tlDir, lang);
    const data = extractor.scan();
    generateRpy(data, tlDir, lang);
    console.log("Done!");
  } else if (cmd === "extract-builtins") {
    const renpyCommon = _findRenpyCommonDir(projectRoot);
    if (!renpyCommon) {
      console.log("ERROR: Ren'Py common/ directory not found!");
      console.log("Looked in: renpy/common, renpy-8.5.2-sdk/renpy/common, etc.");
      return;
    }
    const extractor = new RenPyExtractor(gameDir);
    extractor.setExistingTranslations(tlDir, lang);
    const blocks = extractor.scanEngineBuiltins(renpyCommon);
    const generated = generateEngineRpy(blocks, tlDir, extractor._existingTranslations, lang);
    if (generated.length > 0) {
      console.log(`Generated ${generated[0]} (${blocks.length} strings)`);
    } else {
      console.log("No engine built-in strings found.");
    }
    _cleanEngineDuplicatesFromScreens(tlDir);
    console.log("Done!");
  } else if (cmd === "verify" || cmd === "stats") {
    if (!existsSync(tlDir)) {
      console.log("ERROR: tl directory not found: " + tlDir);
      return;
    }
    verifyIntegrity(gameDir, tlDir, undefined, lang);
  } else {
    console.log("Unknown command:", cmd);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
