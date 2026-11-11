/**
 * voice_corpus_check.mts — верификатор сгенерированного корпуса (задача
 * 2026-11-10, надёжность генерации демо-аудио).
 *
 * Для языка сверяет ОЖИДАЕМЫЙ набор (selectPhrases каталога) с диском:
 *   - пропуски (ожидался файл — нет на диске);
 *   - сироты (файл есть — в наборе не значится);
 *   - валидность каждого файла: Ogg Opus (OpusHead), original rate 24000,
 *     непустой (>512 байт);
 *   - выборочно (N файлов): интегральная громкость ebur128 ≈ -16 LUFS (±1.5).
 *
 * Запуск: node voice_corpus_check.mts --lang ru [--demo] [--engine voxcpm2] [--loudness N]
 * Код выхода: 0 — чисто, 1 — есть пропуски/битые, 2 — только сироты.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { loadCatalog, parseCli, selectPhrases } from "./voice_batch.mts";

/** Метаданные Ogg Opus из заголовка (чистая — тестируется). */
export function parseOpusMeta(buf: Buffer): { rate: number } | null {
  if (buf.subarray(0, 4).toString() !== "OggS") return null;
  const i = buf.indexOf("OpusHead");
  if (i < 0) return null;
  return { rate: buf.readUInt32LE(i + 12) };
}

/** Интегральная громкость (LUFS) через ebur128; null — если не измерилась. */
export function measureLufs(path: string): number | null {
  const r = spawnSync("ffmpeg", ["-i", path, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf-8" });
  const m = /I:\s*(-?\d+\.\d+) LUFS/.exec(r.stderr ?? "");
  return m ? Number(m[1]) : null;
}

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

function main(): number {
  const argv = process.argv.slice(2);
  const val = (n: string): string | undefined => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
  const lang = val("--lang") ?? "ru";
  const loudness = Number(val("--loudness") ?? 5);
  // движок выбирает шим/venv; контракт имён ЕДИНЫЙ для обоих движков
  // ({uid}__{Спикер}, владелец 2026-11-11: без лишнего постфикса)
  const engine = val("--engine") ?? "voxcpm2";
  const args = parseCli(["--lang", lang, "--engine", engine, ...(argv.includes("--demo") ? ["--demo"] : [])]);
  const phrases = selectPhrases(loadCatalog(lang), args);

  const root = join(import.meta.dirname, "..", "..", "..", "audio", lang);
  const expected = new Map(phrases.map((p) => [p.out.replace(/\.[^.]+$/, ".opus"), p]));
  const onDisk = walk(root).filter((f) => f.endsWith(".opus"));
  const diskSet = new Set(onDisk);

  const missing = [...expected.keys()].filter((f) => !diskSet.has(f));
  const orphans = onDisk.filter((f) => !expected.has(f));
  const broken: string[] = [];
  const sample: string[] = [];

  for (const f of onDisk) {
    const meta = parseOpusMeta(readFileSync(f));
    const size = statSync(f).size;
    if (!meta || meta.rate !== 24000 || size <= 512) {
      broken.push(`${f} (${meta ? `rate=${meta.rate}` : "не opus"}, ${size}B)`);
      continue;
    }
    if (sample.length < loudness) sample.push(f);
  }

  console.log(`[corpus-check] lang=${lang} ожидается ${expected.size}, на диске ${onDisk.length}`);
  console.log(`  пропусков: ${missing.length} | сирот: ${orphans.length} | битых: ${broken.length}`);
  for (const f of missing.slice(0, 10)) console.log(`  ПРОПУСК ${f}`);
  for (const f of orphans.slice(0, 10)) console.log(`  СИРОТА ${f}`);
  for (const b of broken.slice(0, 10)) console.log(`  БИТЫЙ ${b}`);
  if (sample.length) {
    console.log(`  громкость (выборка ${sample.length}):`);
    for (const f of sample) {
      const l = measureLufs(f);
      const ok = l !== null && Math.abs(l + 16) <= 1.5;
      console.log(`    ${ok ? "OK" : "МИМО"} ${l ?? "?"} LUFS | ${f.split(/[\\/]/).pop()}`);
    }
  }
  if (missing.length || broken.length) return 1;
  if (orphans.length) return 2;
  console.log("  ЧИСТО ✓");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
