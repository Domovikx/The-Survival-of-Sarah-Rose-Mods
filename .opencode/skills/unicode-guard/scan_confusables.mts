#!/usr/bin/env node

/**
 * @module scan_confusables
 * @description Unicode-confusable сканер — ТОЛЬКО ДИАГНОСТИКА, никаких автозамен.
 *
 * Находит символы, которые VS Code помечает как "could be confused with the
 * ASCII character", плюс родственные беды:
 *
 * 1. MIXED_SCRIPT — слово из букв двух скриптов (латиница+кириллица в одном
 *    слове). Классический пример «слoво» с латинской o. Подкласс
 *    CONFUSED — когда латинское слово содержит 1-2 кириллических lookalike
 *    (это ровно тот варнинг, который видит владелец в VS Code).
 * 2. INVISIBLE — невидимые символы: ZWSP/ZWNJ/ZWJ/WJ/BOM/SHY, bidi-контролы.
 * 3. NBSP — неразрывный пробел (в коде почти всегда мусор, в русском тексте
 *    может быть намеренным — флагается как warn).
 * 4. TYPO_APOSTROPHE — типографский апостроф ’ внутри латинского слова
 *    (должен быть ASCII ').
 *
 * Escape-последовательности (\n, \uXXXX) маскируются ДО анализа слов, чтобы
 * "nХарактер" из "...\nХарактер" не считался смешанным словом.
 *
 * Инструмент НИКОГДА ничего не правит — по правилу владельца (2026-10-23):
 * нашли место → чиним руками, точечно.
 *
 * Использование:
 *   node scan_confusables.mts <path> [more paths...]   # файлы/каталоги
 *   node scan_confusables.mts --json <path>            # машинный вывод
 *
 * Exit code: 0 — чисто, 1 — найдено (годится как CI-гейт).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Каталоги, которые никогда не сканируем. */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "__pycache__", ".cache"]);

/** Расширения сканируемых файлов. */
const SCAN_EXT = new Set([
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".rpy",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".txt",
  ".cfg",
  ".py",
  ".sh",
  ".cmd",
]);

/** Невидимые/типографские символы → категория. */
const CHAR_CHECKS: Array<{ re: RegExp; kind: "INVISIBLE" | "NBSP" | "TYPO"; name: string }> = [
  // ZWJ (\u200D) нельзя в классе символов (no-misleading-character-class) —
  // чередование вместо класса, семантика «любой из» та же.
  { re: /\u200B|\u200C|\u200D|\u2060|\uFEFF|\u00AD/u, kind: "INVISIBLE", name: "zero-width/soft-hyphen" },
  { re: /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/u, kind: "INVISIBLE", name: "bidi-control" },
  { re: /\u00A0/u, kind: "NBSP", name: "NBSP" },
];

const isLatin = (ch: string): boolean => /[A-Za-z]/.test(ch);
const isCyrillic = (ch: string): boolean => /[\u0400-\u04FF]/.test(ch);

/** Кириллические lookalike (визуально == латинская/греческая буква). */
const CYRILLIC_LOOKALIKES = new Set("АВЕКМНОРСТХаверосухАВЕКМНОРСТХ".split(""));

interface Finding {
  file: string;
  line: number;
  kind: "CONFUSED" | "MIXED_SCRIPT" | "INVISIBLE" | "NBSP" | "TYPO";
  detail: string;
  excerpt: string;
}

/** Маскирует escape-последовательности (\n, \uXXXX, \xXX), сохраняя длину. */
export function maskEscapes(line: string): string {
  return line.replace(/\\(?:u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (m) => "\u0000".repeat(m.length));
}

/** Анализ одной строки на смешанные скрипты. */
function checkMixedScript(file: string, lineNo: number, raw: string): Finding[] {
  const out: Finding[] = [];
  const line = maskEscapes(raw);
  // слово = буквы (с апострофами внутри); \u0000-маски не входят в \p{L}
  const words = line.match(/[\p{L}]+(?:['\u2019][\p{L}]+)*/gu) ?? [];
  for (const w of words) {
    let lat = 0,
      cyr = 0,
      cyrLook = 0;
    for (const ch of w) {
      if (isLatin(ch)) lat++;
      else if (isCyrillic(ch)) {
        cyr++;
        if (CYRILLIC_LOOKALIKES.has(ch)) cyrLook++;
      }
    }
    if (lat === 0 || cyr === 0) continue;
    // Latin-доминантное слово с кириллическим lookalike = ровно "confused with ASCII"
    const kind = lat >= cyr * 2 && cyrLook > 0 ? "CONFUSED" : "MIXED_SCRIPT";
    const chars = [...w]
      .filter((c) => isCyrillic(c))
      .map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase()}(${c})`);
    out.push({
      file,
      line: lineNo,
      kind,
      detail: `"${w}" — кириллица внутри: ${chars.join(", ")}`,
      excerpt: excerpt(raw, w),
    });
    void cyr;
  }
  return out;
}

/** Контекст ±30 символов вокруг находки. */
function excerpt(raw: string, needle: string): string {
  const i = raw.indexOf(needle);
  if (i < 0) return raw.trim().slice(0, 70);
  const a = Math.max(0, i - 30),
    b = Math.min(raw.length, i + needle.length + 30);
  return `${a > 0 ? "…" : ""}${raw.slice(a, b)}${b < raw.length ? "…" : ""}`;
}

/** Сканирует содержимое файла, возвращает находки. */
export function scanContent(file: string, content: string): Finding[] {
  const out: Finding[] = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    out.push(...checkMixedScript(file, lineNo, raw));
    for (const { re, kind, name } of CHAR_CHECKS) {
      const m = raw.match(re);
      if (m) {
        const cp = m[0].codePointAt(0)!.toString(16).toUpperCase();
        out.push({ file, line: lineNo, kind, detail: `${name} U+${cp}`, excerpt: excerpt(raw, m[0]) });
      }
    }
    // типографский апостроф внутри латинского слова (don’t, it’s)
    const typo = raw.match(/\b[\w]+[\u2019][\w]+\b/g);
    if (typo) {
      for (const w of typo) {
        out.push({
          file,
          line: lineNo,
          kind: "TYPO",
          detail: `"${w}" — typographic ’ (U+2019) в латинском слове`,
          excerpt: excerpt(raw, w),
        });
      }
    }
  });
  return out;
}

/** Рекурсивно собирает файлы для сканирования. */
function collectFiles(paths: string[]): string[] {
  const files: string[] = [];
  const walk = (p: string): void => {
    const st = statSync(p);
    if (st.isDirectory()) {
      const base = p.split(/[\\/]/).pop() ?? "";
      if (SKIP_DIRS.has(base)) return;
      for (const e of readdirSync(p)) walk(join(p, e));
    } else {
      const dot = p.lastIndexOf(".");
      if (dot >= 0 && SCAN_EXT.has(p.slice(dot).toLowerCase())) files.push(p);
    }
  };
  for (const p of paths) walk(p);
  return files;
}

function main(): void {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const paths = args.filter((a) => !a.startsWith("--"));
  if (paths.length === 0) {
    console.error("usage: node scan_confusables.mts [--json] <file-or-dir> [more...]");
    process.exit(2);
  }
  const findings: Finding[] = [];
  for (const f of collectFiles(paths)) {
    try {
      findings.push(...scanContent(f, readFileSync(f, "utf8")));
    } catch (e) {
      console.error(`skip ${f}: ${(e as Error).message}`);
    }
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const root = process.cwd();
  if (json) {
    console.log(
      JSON.stringify(
        findings.map((f) => ({ ...f, file: relative(root, f.file) })),
        null,
        2,
      ),
    );
  } else {
    for (const f of findings) {
      console.log(`${relative(root, f.file)}:${f.line}: [${f.kind}] ${f.detail}`);
      console.log(`    ${f.excerpt}`);
    }
    const byKind = new Map<string, number>();
    for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
    const summary = [...byKind].map(([k, n]) => `${k}=${n}`).join(" ") || "чисто";
    console.log(`--- ${findings.length} находок: ${summary}`);
  }
  process.exit(findings.length > 0 ? 1 : 0);
}

// Запуск CLI только при прямом вызове (не при импорте из тестов)
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
