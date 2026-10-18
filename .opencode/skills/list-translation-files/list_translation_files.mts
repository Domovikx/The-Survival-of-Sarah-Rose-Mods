#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Translation counters for a single file.
 */
export interface FileStats {
  total: number;
  translated: number;
}

/**
 * A single analyzed .rpy file entry.
 */
export interface FileEntry {
  path: string;
  filepath?: string;
  stats: FileStats;
}

/**
 * Map of arc name -> analyzed files.
 */
export type ArcsMap = Record<string, FileEntry[]>;

/**
 * Analyze a single .rpy file content.
 * Counts old/new pairs and detects if translation is present (old !== new).
 *
 * @param content - The file content
 * @returns Total and translated counters
 */
export function analyzeContent(content: string): FileStats {
  let total = 0;
  let translated = 0;
  let inTranslate = false;
  let currentOld: string | null = null;

  for (const rawLine of content.split("\n")) {
    const s = rawLine.trim();

    if (s.startsWith("translate ru strings:")) {
      inTranslate = true;
      currentOld = null;
      continue;
    }

    if (inTranslate && s.startsWith("old ")) {
      const m = s.match(/^old "(.*)"\s*$/);
      if (m) {
        currentOld = m[1];
      }
      continue;
    }

    if (inTranslate && currentOld !== null && s.startsWith("new ")) {
      const m = s.match(/^new "(.*)"\s*$/);
      if (m) {
        total++;
        if (m[1] !== currentOld) {
          translated++;
        }
      }
      currentOld = null;
      continue;
    }

    if (inTranslate && s && !s.startsWith("old ") && !s.startsWith("new ") && !s.startsWith("#")) {
      inTranslate = false;
    }
  }

  return { total, translated };
}

/**
 * Recursively collect all .rpy files from tlDir,
 * analyze each, group by arc folder.
 *
 * @param tlDir - Absolute path to game/tl/ru/
 * @param projectRoot - Absolute path to project root
 * @returns arcs map
 */
export function collectFiles(tlDir: string, projectRoot: string): ArcsMap {
  const arcs: ArcsMap = {};

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".rpy")) {
        const rel = relative(projectRoot, fullPath).split(sep).join("/");
        const arcName = dir === tlDir ? "__root__" : relative(tlDir, dir).split(sep).join("/");
        const stats = analyzeContent(readFileSync(fullPath, "utf-8"));
        if (!arcs[arcName]) {
          arcs[arcName] = [];
        }
        arcs[arcName].push({ path: rel, filepath: fullPath, stats });
      }
    }
  }

  walk(tlDir);
  return arcs;
}

/**
 * Format human-readable status report.
 *
 * @param arcs - arcs map from collectFiles
 * @param showAll - show fully translated files too
 * @returns formatted status text
 */
export function formatStatus(arcs: ArcsMap, showAll = false): string {
  const lines: string[] = [];
  lines.push("=== Translation status: game/tl/ru/ ===");
  lines.push("");

  const sortedArcs = Object.keys(arcs).sort();

  for (const arcName of sortedArcs) {
    const files = arcs[arcName];
    const totalStrings = files.reduce((s, f) => s + f.stats.total, 0);
    const translatedStrings = files.reduce((s, f) => s + f.stats.translated, 0);
    const filesTotal = files.length;
    const filesDone = files.filter((f) => f.stats.total > 0 && f.stats.translated === f.stats.total).length;
    const filesEmpty = files.filter((f) => f.stats.total === 0).length;
    const filesPartial = filesTotal - filesDone - filesEmpty;
    const pct = totalStrings ? (translatedStrings / totalStrings) * 100 : 0;

    const label = arcName === "__root__" ? "(root files: misc_strings.rpy, screens.rpy)" : arcName;

    let status: string;
    if (totalStrings === 0) status = "EMPTY";
    else if (translatedStrings === totalStrings) status = "DONE";
    else if (translatedStrings === 0) status = "NOT_STARTED";
    else status = "PARTIAL";

    lines.push(`[${status.padEnd(12)}] ${label}/  (${translatedStrings}/${totalStrings} strings, ${pct.toFixed(1)}%)`);
    lines.push(`    Files: ${filesTotal} (done=${filesDone}, partial=${filesPartial}, empty=${filesEmpty})`);
    lines.push("");

    for (const f of files) {
      const s = f.stats;
      const relStr = f.path;

      if (s.total === 0) {
        lines.push(`  [EMPTY] ${relStr}  - 0 strings`);
      } else if (s.translated === s.total) {
        if (!showAll) continue;
        lines.push(
          `  [DONE] ${relStr}  - ${s.translated}/${s.total} (${((100 * s.translated) / s.total).toFixed(0)}%)`,
        );
      } else if (s.translated === 0) {
        lines.push(`  [NONE] ${relStr}  - 0/${s.total} (0%)`);
      } else {
        lines.push(
          `  [PART] ${relStr}  - ${s.translated}/${s.total} (${((100 * s.translated) / s.total).toFixed(0)}%)`,
        );
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format copy-ready paths depending on mode.
 *
 * @param arcs - arcs map from collectFiles
 * @param mode - 'arcs' | 'files-untranslated' | 'files-all' | 'arcs-untranslated'
 * @returns newline-separated paths
 */
export function formatCopyReady(arcs: ArcsMap, mode: string): string {
  const lines: string[] = [];
  const sortedArcs = Object.keys(arcs).sort();

  if (mode === "arcs") {
    for (const arcName of sortedArcs) {
      if (arcName === "__root__") continue;
      lines.push(`game/tl/ru/${arcName}`);
    }
  } else if (mode === "files-untranslated") {
    for (const arcName of sortedArcs) {
      for (const f of arcs[arcName]) {
        if (f.stats.total > 0 && f.stats.translated < f.stats.total) {
          lines.push(f.path);
        }
      }
    }
  } else if (mode === "files-all") {
    for (const arcName of sortedArcs) {
      for (const f of arcs[arcName]) {
        lines.push(f.path);
      }
    }
  } else if (mode === "arcs-untranslated") {
    for (const arcName of sortedArcs) {
      if (arcName === "__root__") {
        for (const f of arcs[arcName]) {
          if (f.stats.total > 0 && f.stats.translated < f.stats.total) {
            lines.push(f.path);
          }
        }
        continue;
      }
      const total = arcs[arcName].reduce((s, f) => s + f.stats.total, 0);
      const translated = arcs[arcName].reduce((s, f) => s + f.stats.translated, 0);
      if (total > 0 && translated < total) {
        lines.push(`game/tl/ru/${arcName}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * CLI entry point.
 */
function main(): void {
  const args = process.argv.slice(2);

  const mode = args[0] || "status";
  const showAll = args.includes("--all") || args.includes("-a");

  const validModes = ["status", "arcs", "files-untranslated", "files-all", "arcs-untranslated"];
  if (!validModes.includes(mode)) {
    console.error(`Unknown mode: ${mode}`);
    console.error("Valid modes: status, arcs, files-untranslated, files-all, arcs-untranslated");
    process.exit(1);
  }

  const scriptDir = join(fileURLToPath(new URL(".", import.meta.url)));
  const projectRoot = join(scriptDir, "..", "..", "..");
  const tlDir = join(projectRoot, "game", "tl", "ru");

  const arcs = collectFiles(tlDir, projectRoot);

  if (mode === "status") {
    console.log(formatStatus(arcs, showAll));
  } else {
    console.log(formatCopyReady(arcs, mode));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
