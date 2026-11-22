/**
 * po_index.mts — собрать индекс POT/PO на Rust (ускоритель для stats/voice_status).
 *
 * Оракул остаётся на TS: индекс хранит штампы (mtime+size) файлов, и если файл
 * изменился, потребитель пересчитывает сам (см. `scripts/stats.mts`).
 *
 *   node scripts/po_index.mts          # собрать (cargo build при необходимости)
 *   node scripts/po_index.mts --check  # только проверить, что бинарь и индекс свежие
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "tools", "po-index", "Cargo.toml");
const BIN = join(
  ROOT,
  "tools",
  "po-index",
  "target",
  "release",
  process.platform === "win32" ? "po-index.exe" : "po-index",
);
const OUT = join(ROOT, "tmp", "po-index.json");

export const INDEX_PATH = OUT;

const build = (): void => {
  execFileSync("cargo", ["build", "--release", "--manifest-path", MANIFEST], {
    cwd: ROOT,
    stdio: "inherit",
  });
};

const run = (): void => {
  mkdirSync(dirname(OUT), { recursive: true });
  execFileSync(
    BIN,
    [
      "--pot",
      join(ROOT, "patches", "ai-voice-pack", "po", "template.pot"),
      "--po-dir",
      join(ROOT, "patches", "ai-voice-pack", "po"),
      "--out",
      OUT,
    ],
    { cwd: ROOT, stdio: "inherit" },
  );
};

const main = (): void => {
  const check = process.argv.includes("--check");
  if (!existsSync(BIN)) {
    if (check) {
      console.error(`po-index: нет бинаря ${BIN} — соберите: node scripts/po_index.mts`);
      process.exit(1);
    }
    build();
  }
  if (check) {
    const fresh = existsSync(OUT) && statSync(OUT).mtimeMs >= statSync(BIN).mtimeMs;
    if (!fresh) {
      console.error("po-index: индекс старше бинаря — пересоберите: node scripts/po_index.mts");
      process.exit(1);
    }
    console.log("po-index: ок");
    return;
  }
  run();
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
