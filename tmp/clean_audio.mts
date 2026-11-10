/**
 * clean_audio.mts — разовая очистка СГЕНЕРИРОВАННОЙ озвучки (задача
 * tasks/2026-11-10-demo-voice-emotion-recheck.md, владелец 2026-11-10).
 * Удаляет ТОЛЬКО *.opus / *.wav строго внутри patches/ai-voice-pack/audio/.
 * Рефы casts/voices/** НЕ трогаются. Без --apply — dry-run (только отчёт).
 *
 * Запуск: node tmp/clean_audio.mts [--apply]
 */
import { readdirSync, rmSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "patches", "ai-voice-pack", "audio");
const APPLY = process.argv.includes("--apply");

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const all = walk(ROOT);
const targets = all.filter((f) => [".opus", ".wav"].includes(extname(f).toLowerCase()));
const others = all.filter((f) => ![".opus", ".wav"].includes(extname(f).toLowerCase()));

console.log(`корень: ${ROOT}`);
console.log(`файлов в audio/: ${all.length} | к удалению (.opus/.wav): ${targets.length}`);
if (others.length) {
  console.log(`НЕ трогаем (${others.length}):`);
  for (const f of others.slice(0, 10)) console.log(`  ${f}`);
}
if (!APPLY) {
  console.log("dry-run: ничего не удалено (запусти с --apply)");
  process.exit(0);
}
let bytes = 0;
for (const f of targets) {
  bytes += statSync(f).size;
  rmSync(f);
}
// пустые каталоги — за собой
const dirs = new Set(targets.map((f) => join(f, "..")));
for (const d of dirs) {
  try {
    if (readdirSync(d).length === 0) rmSync(d, { recursive: true });
  } catch {
    /* уже убран с родителем */
  }
}
const left = readdirSync(ROOT).length;
console.log(`удалено файлов: ${targets.length} (${(bytes / 1024 / 1024 / 1024).toFixed(2)} ГиБ)`);
console.log(`в audio/ осталось записей верхнего уровня: ${left}`);
