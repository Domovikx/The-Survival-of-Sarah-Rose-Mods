/**
 * voice_bench.mts — бенч-харнесс движка озвучки («до/после» при смене стека).
 *
 * Задача: tasks/2026-10-24-voice-engine-update-benchmark.md. Меряет СКОРОСТЬ
 * production-пути: шим cosyworker.py (инференс) -> trim -> opus (VoiceWorker).
 * Пишет результаты во временную папку tmp/voice_bench/, корпус audio/<lang> НЕ
 * трогает (каждая фраза уходит в свой out-файл бенча).
 *
 * Что меряем по каждой фразе:
 *   genSec   — чистый инференс (парсится из лога шима `pcm Xs (gen Ys)`);
 *   wallSec  — полный клиентский путь (инференс + b64-перенос + trim + opus);
 *   rawDur   — длительность речи до трима (для RTF).
 * Сводка: p50/p90, фраз/ч (один воркер и агрегат при --workers N), RTF,
 * падения. Замеры гонять ТОЛЬКО на свободной GPU (гард --allow-busy-gpu).
 *
 * ЗАПУСК (из корня репы):
 *   node tools/generate/scripts/voice_bench.mts --tag A --n 60 --dry-run  # выборка
 *   node tools/generate/scripts/voice_bench.mts --tag A --n 60             # база
 *   node tools/generate/scripts/voice_bench.mts --tag B --n 60 \
 *     --python C:/tools/cosyvoice3-bench/.venv/Scripts/python.exe          # кандидат
 *   node tools/generate/scripts/voice_bench.mts --tag D3 --n 60 --workers 3
 *
 * ИТОГ: tmp/voice_bench/<tag>.jsonl (пофразовино) + <tag>-summary.json.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DEFAULT_PYTHON, loadCatalog, PKG_ROOT, selectPhrases, type Args, type Phrase } from "./voice_batch.mts";
import { VoiceWorker } from "./voicekit/worker.mts";

const SCRIPTS_DIR = fileURLToPath(new URL(".", import.meta.url));
const SHIM = join(SCRIPTS_DIR, "cosyworker.py");
/** Репа-корень: PKG_ROOT = patches/ai-voice-pack -> ../../. */
const REPO_ROOT = join(PKG_ROOT, "..", "..");
const BENCH_DIR = join(REPO_ROOT, "tmp", "voice_bench");

// --------------------------------------------------------------- выборка ---

/** mulberry32 — детерминированный PRNG (один seed = одинаковая выборка). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Детерминированная выборка n фраз: Fisher-Yates с фиксированным seed.
 * Одинаковый seed на всех кандидатах = одна и та же выборка фраз (паритет).
 */
export function selectSample<T>(items: T[], n: number, seed: number): T[] {
  const idx = items.map((_, i) => i);
  const rnd = mulberry32(seed);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, Math.min(n, idx.length)).map((i) => items[i]);
}

// ------------------------------------------------------ метрики/парсинг ----

/** Строка лога шима `  pcm 6.60s (gen 24.3s)` -> длительность и чистый ген. */
export function parseShimGenLine(line: string): { rawDurSec: number; genSec: number } | null {
  const m = /pcm ([\d.]+)s \(gen ([\d.]+)s\)/.exec(line);
  if (!m) return null;
  return { rawDurSec: Number(m[1]), genSec: Number(m[2]) };
}

export interface Stats {
  n: number;
  mean: number;
  p50: number;
  p90: number;
}

/** mean/p50/p90 по массиву чисел (pXX — линейная интерполяция по порядку). */
export function computeStats(values: number[]): Stats {
  if (values.length === 0) return { n: 0, mean: 0, p50: 0, p90: 0 };
  const sorted = values.toSorted((a, b) => a - b);
  const at = (p: number): number => {
    const pos = (sorted.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  };
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  return { n: sorted.length, mean, p50: at(0.5), p90: at(0.9) };
}

export interface GpuSnapshot {
  utilPct: number;
  memUsedMiB: number;
  memFreeMiB: number;
}

/** Снимок GPU через nvidia-smi (null, если недоступен). */
export function gpuSnapshot(): GpuSnapshot | null {
  const r = spawnSync(
    "nvidia-smi",
    ["--query-gpu=utilization.gpu,memory.used,memory.free", "--format=csv,noheader,nounits"],
    { encoding: "utf-8", windowsHide: true },
  );
  if (r.status !== 0) return null;
  const [u, used, free] = r.stdout
    .trim()
    .split(/,\s*/)
    .map((s) => Number(s.trim()));
  if (![u, used, free].every(Number.isFinite)) return null;
  return { utilPct: u, memUsedMiB: used, memFreeMiB: free };
}

// ------------------------------------------------------------- результат ---

interface PhraseRecord {
  worker: number;
  uid: string;
  voice: string;
  arc: string;
  chars: number;
  emotion: boolean;
  warmup: boolean;
  ok: boolean;
  genSec?: number;
  wallSec?: number;
  rawDurSec?: number;
  error?: string;
}

interface BenchSummary {
  tag: string;
  ts: string;
  lang: string;
  n: number;
  workers: number;
  python: string;
  generationSeed: number;
  sampleSeed: number;
  gpuStart: GpuSnapshot | null;
  gpuEnd: GpuSnapshot | null;
  modelLoadSec: number[];
  ok: number;
  failed: number;
  warmupsExcluded: number;
  genSec: Stats;
  wallSec: Stats;
  rtf: Stats;
  phrasesPerHourPerWorker: number;
  aggregatePhrasesPerHour: number;
  elapsedSec: number;
  audioSecTotal: number;
}

// ------------------------------------------------------------------- CLI ---

interface BenchCli {
  tag: string;
  n: number;
  lang: string;
  python: string;
  device: string;
  workers: number;
  generationSeed: number;
  sampleSeed: number;
  dryRun: boolean;
  allowBusyGpu: boolean;
}

export function parseBenchCli(argv: string[]): BenchCli {
  const o: BenchCli = {
    tag: "run",
    n: 60,
    lang: "ru",
    python: DEFAULT_PYTHON,
    device: "cuda",
    workers: 1,
    generationSeed: 42,
    sampleSeed: 42,
    dryRun: false,
    allowBusyGpu: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`нет значения у ${a}`);
      return v;
    };
    switch (a) {
      case "--tag":
        o.tag = next();
        break;
      case "--n":
        o.n = Number(next());
        break;
      case "--lang":
        o.lang = next();
        break;
      case "--python":
        o.python = next();
        break;
      case "--device":
        o.device = next();
        break;
      case "--workers":
        o.workers = Number(next());
        break;
      case "--seed":
        o.generationSeed = Number(next());
        break;
      case "--sample-seed":
        o.sampleSeed = Number(next());
        break;
      case "--dry-run":
        o.dryRun = true;
        break;
      case "--allow-busy-gpu":
        o.allowBusyGpu = true;
        break;
      default:
        throw new Error(`неизвестная опция: ${a}`);
    }
  }
  if (!Number.isFinite(o.n) || o.n <= 0) throw new Error("--n должен быть > 0");
  if (!Number.isFinite(o.workers) || o.workers <= 0) throw new Error("--workers должен быть > 0");
  return o;
}

// ------------------------------------------------------------------- main --

/**
 * Один воркер = один процесс шима: строчит свой shard фраз, собирая лог
 * шима (строка `pcm Xs (gen Ys)` — источник чистого времени инференса).
 */
async function benchWorker(
  python: string,
  shard: Phrase[],
  o: BenchCli,
  outDir: string,
  workerIdx: number,
  records: PhraseRecord[],
  modelLoadSec: number[],
): Promise<void> {
  const shimLines: string[] = [];
  const w = new VoiceWorker({
    python,
    script: SHIM,
    args: ["--device", o.device],
    onLog: (l) => {
      shimLines.push(l);
      console.log(`  [shim${workerIdx}] ${l}`);
    },
  });
  const tSpawn = Date.now();
  try {
    const ping = await w.ping();
    if (!ping.ok) throw new Error(ping.error ?? "ping failed");
    modelLoadSec.push((Date.now() - tSpawn) / 1000);
    for (let i = 0; i < shard.length; i++) {
      const p = shard[i];
      const warmup = i === 0;
      shimLines.length = 0;
      const t0 = Date.now();
      // Последовательность намеренная: воркер обрабатывает фразы одна за
      // другой (как production) — параллелизм между воркерами, не внутри.
      // eslint-disable-next-line no-await-in-loop
      const r = await w.generate({
        text: p.text,
        ref: p.ref,
        emotion: p.emotion,
        seed: o.generationSeed,
        out: join(outDir, `${p.uid}__${p.voice}.wav`),
      });
      const wallSec = (Date.now() - t0) / 1000;
      const gen = shimLines.map(parseShimGenLine).find((x) => x !== null) ?? null;
      records.push({
        worker: workerIdx,
        uid: p.uid,
        voice: p.voice,
        arc: p.arc,
        chars: p.text.length,
        emotion: p.emotion !== null,
        warmup,
        ok: r.ok,
        wallSec,
        ...(gen ? { genSec: gen.genSec, rawDurSec: gen.rawDurSec } : {}),
        ...(r.ok ? {} : { error: r.error ?? "неизвестная ошибка" }),
      });
    }
  } finally {
    await w.quit().catch(() => w.kill());
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const o = parseBenchCli(argv);
  const entries = loadCatalog();
  const args: Args = {
    lang: o.lang,
    seed: o.generationSeed,
    force: true,
    dryRun: false,
    noEmotion: false,
    keepWav: false,
    wavOnly: false,
    emotionTag: "",
    device: o.device,
    python: o.python,
  };
  const all = selectPhrases(entries, args);
  const sample = selectSample(all, o.n, o.sampleSeed);

  console.log(
    `бенч tag=${o.tag} n=${sample.length} (из ${all.length}) lang=${o.lang} ` +
      `workers=${o.workers} python=${o.python}`,
  );
  for (const p of sample.slice(0, 10)) {
    console.log(
      `  ${p.uid.slice(0, 8)} | ${p.arc} | ${p.voice} | ${p.text.length} симв. | [${p.emotion ? "ton" : "-"}]`,
    );
  }
  if (sample.length > 10) console.log("  ...");
  if (o.dryRun) return 0;

  const gpuStart = gpuSnapshot();
  if (gpuStart && !o.allowBusyGpu && (gpuStart.utilPct > 30 || gpuStart.memUsedMiB > 3000)) {
    console.error(
      `GPU занята (util ${gpuStart.utilPct}%, used ${gpuStart.memUsedMiB} MiB) — замер будет шумным. ` +
        "Останови чужие процессы или повтори с --allow-busy-gpu.",
    );
    return 1;
  }

  const outDir = join(BENCH_DIR, "out", o.tag);
  mkdirSync(outDir, { recursive: true });

  const records: PhraseRecord[] = [];
  const modelLoadSec: number[] = [];
  const shards: Phrase[][] = Array.from({ length: o.workers }, () => []);
  sample.forEach((p, i) => shards[i % o.workers].push(p));

  const tStart = Date.now();
  await Promise.all(shards.map((shard, idx) => benchWorker(o.python, shard, o, outDir, idx, records, modelLoadSec)));
  const elapsedSec = (Date.now() - tStart) / 1000;

  // Статистика: warmup-фразы (первая у каждого воркера) исключаются из сводки.
  const measured = records.filter((r) => r.ok && !r.warmup);
  const genStats = computeStats(measured.map((r) => r.genSec).filter((v): v is number => v !== undefined));
  const wallStats = computeStats(measured.map((r) => r.wallSec ?? 0));
  const rtfStats = computeStats(
    measured
      .filter((r) => r.genSec !== undefined && r.rawDurSec !== undefined && r.rawDurSec > 0)
      .map((r) => (r.genSec as number) / (r.rawDurSec as number)),
  );
  const summary: BenchSummary = {
    tag: o.tag,
    ts: new Date().toISOString(),
    lang: o.lang,
    n: sample.length,
    workers: o.workers,
    python: o.python,
    generationSeed: o.generationSeed,
    sampleSeed: o.sampleSeed,
    gpuStart,
    gpuEnd: gpuSnapshot(),
    modelLoadSec,
    ok: records.filter((r) => r.ok).length,
    failed: records.filter((r) => !r.ok).length,
    warmupsExcluded: records.filter((r) => r.warmup).length,
    genSec: genStats,
    wallSec: wallStats,
    rtf: rtfStats,
    phrasesPerHourPerWorker: wallStats.mean > 0 ? 3600 / wallStats.mean : 0,
    aggregatePhrasesPerHour: elapsedSec > 0 ? (records.length / elapsedSec) * 3600 : 0,
    elapsedSec,
    audioSecTotal: measured.reduce((s, r) => s + (r.rawDurSec ?? 0), 0),
  };

  writeFileSync(join(BENCH_DIR, `${o.tag}.jsonl`), records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(join(BENCH_DIR, `${o.tag}-summary.json`), JSON.stringify(summary, null, 2) + "\n");

  console.log(`\n=== ИТОГ tag=${o.tag} ===`);
  console.log(
    `ok=${summary.ok} failed=${summary.failed} warmup-исключено=${summary.warmupsExcluded} ` +
      `модель (загрузка): ${modelLoadSec.map((s) => `${s.toFixed(1)}с`).join(", ")}`,
  );
  console.log(
    `инференс gen: p50 ${genStats.p50.toFixed(1)}с | p90 ${genStats.p90.toFixed(1)}с | mean ${genStats.mean.toFixed(1)}с (n=${genStats.n})`,
  );
  console.log(
    `полный путь wall: p50 ${wallStats.p50.toFixed(1)}с | p90 ${wallStats.p90.toFixed(1)}с | ` +
      `=> ${summary.phrasesPerHourPerWorker.toFixed(1)} фраз/ч на воркер`,
  );
  console.log(
    `агрегат (${o.workers} ворк.): ${summary.aggregatePhrasesPerHour.toFixed(1)} фраз/ч | ` +
      `RTF p50 ${rtfStats.p50.toFixed(2)} | аудио ${summary.audioSecTotal.toFixed(0)}с за ${elapsedSec.toFixed(0)}с`,
  );
  if (gpuStart && summary.gpuEnd) {
    console.log(
      `GPU: старт util ${gpuStart.utilPct}%/${gpuStart.memUsedMiB}MiB -> ` +
        `финиш util ${summary.gpuEnd.utilPct}%/${summary.gpuEnd.memUsedMiB}MiB`,
    );
  }
  console.log(`файлы: tmp/voice_bench/${o.tag}.jsonl, ${o.tag}-summary.json, аудио out/${o.tag}/`);
  return summary.failed > 0 && summary.ok === 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
