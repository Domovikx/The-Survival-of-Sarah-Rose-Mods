// Сверка покрытия typecheck: что реально вошло в tsc vs что лежит на диске.
// Запуск: node scripts/check_ts_coverage.mts (после `tsc --noEmit --listFilesOnly`)
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
/** tsc зовём напрямую (Windows: npx — это npx.cmd и spawnSync ENOENT). */
const TSC = [join(ROOT, "node_modules", "typescript", "bin", "tsc")];

function walk(dir: string, exts: string[], skip: string[]): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (skip.some((s) => e.name === s)) continue;
      out.push(...walk(full, exts, skip));
    } else if (exts.some((x) => e.name.endsWith(x))) {
      out.push(relative(ROOT, full).split(sep).join("/"));
    }
  }
  return out;
}

function tscFiles(args: string[]): Set<string> {
  const raw = execFileSync(process.execPath, [...TSC, ...args, "--listFilesOnly"], {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const marker = "/The-Survival-of-Sarah-Rose-Mods/";
  const out = new Set<string>();
  for (const line of raw.split("\n")) {
    const p = line.trim().replace(/\\/g, "/");
    const i = p.indexOf(marker);
    if (i >= 0) out.add(p.slice(i + marker.length));
  }
  return out;
}

interface Report {
  label: string;
  covered: number;
  disk: number;
  missing: string[];
}

function report(label: string, cov: Set<string>, disk: string[], exts: string[]): Report {
  const covMine = new Set([...cov].filter((f) => exts.some((e) => f.endsWith(e))));
  const diskSet = new Set(disk);
  const missing = [...diskSet].filter((f) => !covMine.has(f)).toSorted();
  return { label, covered: covMine.size, disk: diskSet.size, missing };
}

const reports: Report[] = [
  report(
    "корень (.mts: skills/po/casts/tools/scripts/demo)",
    tscFiles(["--noEmit"]),
    walk(ROOT, [".mts"], ["tmp", "dist", "site"]),
    [".mts"],
  ),
  report(
    "site (.ts/.tsx)",
    tscFiles(["--noEmit", "-p", "site/tsconfig.json"]),
    walk(join(ROOT, "site"), [".ts", ".tsx"], ["dist"]),
    [".ts", ".tsx"],
  ),
];

let fail = 0;
for (const r of reports) {
  console.log(`\n=== ${r.label} ===`);
  console.log(`  в проверке: ${r.covered} | на диске: ${r.disk}`);
  if (r.missing.length) {
    fail += r.missing.length;
    for (const m of r.missing) console.log(`  MISSING: ${m}`);
  } else {
    console.log("  покрытие ПОЛНОЕ");
  }
}

console.log(fail ? `\nИТОГ: не покрыто ${fail}` : "\nИТОГ: всё покрыто");
process.exit(fail ? 1 : 0);
