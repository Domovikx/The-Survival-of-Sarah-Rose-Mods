/**
 * trim.mts — паттерн-трим хвостовых артефактов (порт trim_tail_burst.py).
 *
 * Единственное правило (дословно как в python-источнике):
 *     deep silence gap >= minGapMs, за ней — короткий всплеск <= maxBurstMs,
 *     упирающийся в самый конец файла (в пределах eofTolMs)
 * => это артефакт (дыхание/выдох/шум), НЕ слово. Режем.
 *
 * Уровень звука НЕ используется как критерий — только форма «пауза+всплеск».
 *
 * Порт в рамках миграции python → TS (см. AGENTS.md «Миграция python →
 * TypeScript»): раньше тензор резал python (cosyworker.py → trim_tail_burst
 * imports), теперь — worker.mts вызывает trimTailBurst на Float32Array до
 * кодирования. Эталон алгоритма — scripts/trim_tail_burst.py (CLI для wav
 * остаётся python: он вне контура инференса); паритет ловит trim.test.mts.
 *
 * Параметры дефолтные — ровно то, что когда-то звалося как
 * `pattern_trim(speech, sr)` в шиме.
 */

/** Длительность кадра анализа, мс. */
export const FRAME_MS = 10;

/** Дефолты — из trim_tail_burst.py (noise_floor_db=-50, max_burst=500, ...). */
export const DEFAULT_TRIM_OPTS = {
  noiseFloorDb: -50.0,
  maxBurstMs: 500,
  minGapMs: 80,
  eofTolMs: 100,
  fadeMs: 20,
  maxIter: 5,
  /** Ограничение хвостовой тишины, мс (null = выключено, как в рабочем пути). */
  maxTailSilenceMs: null as number | null,
} as const;

export type TrimOptions = {
  [K in keyof typeof DEFAULT_TRIM_OPTS]?: (typeof DEFAULT_TRIM_OPTS)[K];
};

/** Один вырезанный всплеск (dict из python find_tail_burst + cut_at_ms). */
export interface TailCut {
  burstStartFrame: number;
  burstEndFrame: number;
  durMs: number;
  gapMs: number;
  peakDb: number;
  cutAtMs: number;
}

export interface TrimResult {
  /** Усечённые семплы (при вырезке — копия; исходный буфер не мутируется). */
  samples: Float32Array;
  /** Вырезанные всплески (по одному на итерацию, 0 = ничего не тронуто). */
  cuts: TailCut[];
}

/** RMS каждого кадра FRAME_MS в dB. Порт rms_db_frames(). */
export function rmsDbFrames(samples: Float32Array, sr: number): { db: number[]; frame: number } {
  const frame = Math.max(Math.floor((sr * FRAME_MS) / 1000), 1);
  const n = Math.floor(samples.length / frame);
  const db: number[] = [];
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const off = i * frame;
    for (let j = 0; j < frame; j++) {
      const s = samples[off + j];
      sum += s * s;
    }
    const rms = Math.sqrt(sum / frame);
    db.push(20 * Math.log10(rms + 1e-10));
  }
  return { db, frame };
}

/** Информация о найденном паттерне (без cut_at_ms — его считает trim). */
export type TailBurstInfo = Omit<TailCut, "cutAtMs">;

/**
 * Поиск паттерна «тишина → короткий всплеск у EOF». Порт find_tail_burst().
 * @returns info или null, если паттерна нет.
 */
export function findTailBurst(
  db: number[],
  frameMs: number = FRAME_MS,
  noiseFloorDb: number = DEFAULT_TRIM_OPTS.noiseFloorDb,
  maxBurstMs: number = DEFAULT_TRIM_OPTS.maxBurstMs,
  minGapMs: number = DEFAULT_TRIM_OPTS.minGapMs,
  eofTolMs: number = DEFAULT_TRIM_OPTS.eofTolMs,
): TailBurstInfo | null {
  const n = db.length;
  if (n === 0) return null;

  // 1) последний не-тихий кадр (отходим от EOF)
  let i = n - 1;
  while (i >= 0 && db[i] <= noiseFloorDb) i--;
  if (i < 0) return null; // файл целиком тихой
  const burstEnd = i;

  // всплеск должен касаться (или почти касаться) EOF
  if (n - 1 - burstEnd > Math.floor(eofTolMs / frameMs)) return null;

  // 2) отходим назад через всплеск
  let j = burstEnd;
  while (j >= 0 && db[j] > noiseFloorDb) j--;
  const burstStart = j + 1;
  const durMs = (burstEnd - burstStart + 1) * frameMs;
  if (durMs > maxBurstMs) return null;

  // 3) тихая пауза перед всплеском
  let k = burstStart - 1;
  let gapFrames = 0;
  while (k >= 0 && db[k] <= noiseFloorDb) {
    gapFrames++;
    k--;
  }
  const gapMs = gapFrames * frameMs;
  if (gapMs < minGapMs) return null;
  if (k < 0) return null; // перед паузой речи нет — весь файл = один всплеск

  // peak dB всплеска
  let peakDb = -Infinity;
  for (let f = burstStart; f <= burstEnd; f++) peakDb = Math.max(peakDb, db[f]);

  return {
    burstStartFrame: burstStart,
    burstEndFrame: burstEnd,
    durMs,
    gapMs,
    peakDb,
  };
}

/**
 * Режет хвостовые артефакты по паттерну. Порт trim() из trim_tail_burst.py.
 * Работает по Float32Array (mono f32), возвращает копию — вход не мутируется.
 */
export function trimTailBurst(samples: Float32Array, sr: number, opts: TrimOptions = {}): TrimResult {
  const o = { ...DEFAULT_TRIM_OPTS, ...opts };
  let wave = samples;
  const cuts: TailCut[] = [];

  for (let iter = 0; iter < o.maxIter; iter++) {
    const { db, frame } = rmsDbFrames(wave, sr);
    const info = findTailBurst(db, FRAME_MS, o.noiseFloorDb, o.maxBurstMs, o.minGapMs, o.eofTolMs);
    if (info === null) break;
    const cutSample = info.burstStartFrame * frame;
    wave = wave.slice(0, cutSample);
    cuts.push({ ...info, cutAtMs: (cutSample / sr) * 1000 });
  }

  if (o.maxTailSilenceMs !== null && o.maxTailSilenceMs !== undefined && wave.length > 0) {
    const { db, frame } = rmsDbFrames(wave, sr);
    const thr = o.noiseFloorDb;
    let endFrame = db.length - 1;
    while (endFrame >= 0 && db[endFrame] <= thr) endFrame--;
    const tailSilenceMs = (db.length - 1 - endFrame) * FRAME_MS;
    if (tailSilenceMs > o.maxTailSilenceMs) {
      const keepFrames = endFrame + 1 + Math.floor(o.maxTailSilenceMs / FRAME_MS);
      const newLen = Math.min(wave.length, keepFrames * frame);
      if (newLen > 0 && newLen < wave.length) {
        wave = wave.slice(0, newLen);
        const f = Math.floor((sr * o.fadeMs) / 1000);
        // torch.linspace(1.0, 0.0, f) — концы включительно, последний = 0
        if (f > 1 && wave.length > f * 2) {
          for (let x = 0; x < f; x++) wave[wave.length - f + x] *= 1 - x / (f - 1);
        }
      }
    }
  }

  return { samples: wave, cuts };
}
