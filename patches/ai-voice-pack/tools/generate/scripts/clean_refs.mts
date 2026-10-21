/**
 * clean_refs.mts — чистка рефов голосов: денойз + EQ + громкость (ffmpeg).
 *
 * ПОРТ clean_refs.py (2026-10-21): цепочка фильтров, двухпроходный loudnorm
 * и сжатие пауз перенесены один-в-один; python-скрипт удалён после зелёных
 * .mts-тестов (волна переноса PIPELINE.md).
 *
 * ПРОБЛЕМЫ ИСТОЧНИКОВ (обе решаем здесь):
 *   1. «Подшипливание» (шум/яркость >8 кГц) — CV3 клонирует тембр вместе
 *      с шумом, поэтому чистим рефы ДО генерации.
 *   2. РАЗНАЯ ГРОМКОСТЬ рефов — выравниваем EBU R128 loudnorm: -16 LUFS,
 *      TP -1.5 dB.
 *
 * ЦЕПОЧКА ffmpeg (порядок важен):
 *   1. highpass f=60             — срез низкочастотного гула/постоянки
 *   2. afftdn nr=10              — FFT-денойз (равномерный шип)
 *   3. deesser i=0.3             — срез сибилянтов «с/ш»
 *   4. highshelf f=8000 g=-4     — приглушение яркости >8 кГц
 *   5. loudnorm I=-16 (2 прохода) — выравнивание громкости (EBU R128)
 *   6. afade in/out 30мс         — защита от кликов по краям
 *
 * Сжатие пауз (compressPauses): любая пауза длиннее target (0.35с из конфига)
 * сжимается до target — окна 20мс, порог тишины refs.silence_db.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";

import { get } from "./config.mts";

/** Цепочка фильтров чистки (до loudnorm; тот идёт вторым проходом). */
export const FILTERS = "highpass=f=60,afftdn=nr=10,deesser=i=0.3,highshelf=f=8000:g=-4";

/** Наборы фильтров для A/B вариантов (от лёгкого к агрессивному). */
export const FILTER_PRESETS: Record<string, string> = {
  light: "highpass=f=60,afftdn=nr=10,deesser=i=0.3,highshelf=f=8000:g=-4",
  default: "highpass=f=60,afftdn=nr=10,deesser=i=0.3,highshelf=f=8000:g=-4",
  strong: "highpass=f=60,afftdn=nr=30,deesser=i=0.7,highshelf=f=8000:g=-8,lowpass=f=14000",
};

/** Фейды по краям (защита от кликов/щелчков), сек. */
export const FADE = 0.03;

/** Параметры loudnorm (EBU R128) — как в python-эталоне. */
export const LOUD_I = -16.0; // интегральная громкость, LUFS
export const LOUD_TP = -1.5; // true peak, dB
export const LOUD_LRA = 11.0; // диапазон громкости

/** Выходная частота чистки (в python — литерал в каждой ffmpeg-команде). */
export const SR = 24000;

/** Запуск процесса: {status, stderr, stdout} (ошибка запуска — исключение). */
export function run(cmd: string, args: string[]): { status: number; stderr: string; stdout: string } {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { status: r.status ?? -1, stderr: r.stderr ?? "", stdout: r.stdout ?? "" };
}

/** Запуск, обязанный завершиться успешно (иначе исключение с хвостом stderr). */
export function runOk(cmd: string, args: string[]): void {
  const r = run(cmd, args);
  if (r.status !== 0) {
    throw new Error(`${cmd} exited ${r.status}: ${r.stderr.slice(-500)}`);
  }
}

/** Длительность файла, сек (ffprobe format=duration). */
export function probeDuration(file: string): number {
  const r = run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  if (r.status !== 0) throw new Error(`ffprobe exited ${r.status}: ${r.stderr.slice(-300)}`);
  const v = Number.parseFloat(r.stdout.trim().split(/\r?\n/)[0]);
  if (!Number.isFinite(v)) throw new Error(`ffprobe: не удалось прочитать длительность ${file}`);
  return v;
}

/** (target, silence_db) сжатия пауз — из конфига, как python pause_params(). */
export function pauseParams(): [number, number] {
  const pause = (get<Record<string, unknown>>("refs", "pause_compress", {}) as Record<string, unknown>) ?? {};
  const target = Number.parseFloat(String(pause.target ?? 0.35));
  const silenceDb = Number.parseFloat(String(get("refs", "silence_db", -45.0)));
  return [target, silenceDb];
}

/**
 * Сжать ВСЕ паузы длиннее target до target (окна 20мс).
 * Порог тишины — refs.silence_db (dBFS). Как python compress_pauses().
 */
export function compressPauses(x: Float32Array, sr: number): { y: Float32Array; maxPause: number; nCut: number } {
  const [target, silenceDb] = pauseParams();
  const win = Math.max(Math.floor(0.02 * sr), 1);
  const frames = Math.floor(x.length / win);
  if (frames < 4) return { y: x, maxPause: 0, nCut: 0 };

  const rms = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = 0; i < win; i++) {
      const v = x[f * win + i];
      sum += v * v;
    }
    rms[f] = Math.sqrt(sum / win);
  }
  const thr = Math.pow(10, silenceDb / 20);

  // Рун-ленгт сегментов тишины/звука
  const segs: { silent: boolean; a: number; b: number }[] = [];
  let start = 0;
  let cur = rms[0] < thr;
  for (let i = 1; i < frames; i++) {
    const s = rms[i] < thr;
    if (s !== cur) {
      segs.push({ silent: cur, a: start, b: i });
      start = i;
      cur = s;
    }
  }
  segs.push({ silent: cur, a: start, b: frames });

  const chunks: Float32Array[] = [];
  let maxPause = 0;
  let nCut = 0;
  for (const seg of segs) {
    const dur = ((seg.b - seg.a) * win) / sr;
    if (!seg.silent) {
      chunks.push(x.subarray(seg.a * win, seg.b * win));
      continue;
    }
    if (dur > maxPause) maxPause = dur;
    if (dur > target) {
      const keep = Math.min(Math.floor((target * sr) / win), seg.b - seg.a);
      chunks.push(x.subarray(seg.a * win, (seg.a + keep) * win));
      nCut++;
    } else {
      chunks.push(x.subarray(seg.a * win, seg.b * win));
    }
  }

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const y = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    y.set(c, off);
    off += c.length;
  }
  return { y, maxPause: Math.round(maxPause * 100) / 100, nCut };
}

/**
 * Прочитать WAV (PCM16) в Float32 [-1..1]; null, если не PCM16 mono@sr —
 * как python read_wav_pcm (wave-проверка частоты/каналов).
 */
export function readWavPcm(path: string, sr: number): Float32Array | null {
  const buf = readFileSync(path);
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }
  let off = 12;
  let dataOff = -1;
  let dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      const channels = buf.readUInt16LE(off + 10);
      const rate = buf.readUInt32LE(off + 12);
      const bits = buf.readUInt16LE(off + 22);
      if (channels !== 1 || rate !== sr || bits !== 16) return null;
    }
    if (id === "data") {
      dataOff = off + 8;
      dataLen = size;
      break;
    }
    off += 8 + size + (size % 2);
  }
  if (dataOff < 0) return null;
  const n = Math.floor(Math.min(dataLen, buf.length - dataOff) / 2);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(dataOff + i * 2) / 32768;
  return x;
}

/** Записать Float32 как WAV PCM16 mono (clip [-1..1], как np.clip в python). */
export function writeWavPcm(path: string, x: Float32Array, sr: number): void {
  const dataLen = x.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < x.length; i++) {
    const v = Math.min(1, Math.max(-1, x[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
}

/** Сжать паузы в WAV-файле на месте. [nCut, maxPause] — как python compress_pauses_file(). */
export function compressPausesFile(path: string, sr: number): [number, number] {
  const x = readWavPcm(path, sr);
  if (x === null) return [0, 0];
  const { y, maxPause, nCut } = compressPauses(x, sr);
  if (nCut) writeWavPcm(path, y, sr);
  return [nCut, maxPause];
}

/**
 * 1-й проход loudnorm: меряем вход, возвращаем JSON-метрики.
 * Используется и самим loudnormTwoPass, и тестами на целевой уровень.
 */
export function measureLoudness(path: string): Record<string, string> {
  const probe = run("ffmpeg", [
    "-i",
    path,
    "-af",
    `loudnorm=I=${LOUD_I}:TP=${LOUD_TP}:LRA=${LOUD_LRA}:print_format=json`,
    "-f",
    "null",
    "-",
  ]);
  const m = probe.stderr.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("loudnorm probe: нет json в выводе ffmpeg");
  return JSON.parse(m[0]) as Record<string, string>;
}

/**
 * Выравнивание громкости в 2 прохода (анализ + применение).
 * linear=false (ДИНАМИЧЕСКИЙ режим) — как в python: все рефы сходятся
 * к -16 LUFS вплотную, даже тихие с редкими пиками.
 */
export function loudnormTwoPass(path: string, dst: string): void {
  const d = measureLoudness(path);
  const args =
    `loudnorm=I=${LOUD_I}:TP=${LOUD_TP}:LRA=${LOUD_LRA}` +
    `:measured_I=${d.input_i}:measured_TP=${d.input_tp}` +
    `:measured_LRA=${d.input_lra}:measured_thresh=${d.input_thresh}` +
    `:linear=false`;
  const tmp = `${dst}.tmp.wav`;
  runOk("ffmpeg", ["-y", "-i", path, "-af", args, "-ac", "1", "-ar", String(SR), tmp]);
  renameSync(tmp, dst);
}

/**
 * Один WAV: чистка (денойз+EQ) -> loudnorm -> фейды. true, если обработан.
 * force=false: существующий dst не трогаем. preset: 'light'/'default'/'strong'
 * или null = FILTERS по умолчанию.
 */
export function cleanFile(src: string, dst: string, opts: { force?: boolean; preset?: string | null } = {}): boolean {
  const { force = false, preset = null } = opts;
  if (existsSync(dst) && !force) return false; // уже чищеный — не трогаем
  const filters = (preset && FILTER_PRESETS[preset]) || FILTERS;
  const tmp1 = `${dst}.tmp1.wav`;
  runOk("ffmpeg", ["-y", "-i", src, "-af", filters, "-ac", "1", "-ar", String(SR), tmp1]);
  loudnormTwoPass(tmp1, dst);
  rmSync(tmp1);
  // Фейды по краям (30мс) — глушим клики. st — от РЕАЛЬНОЙ длительности
  // (клип может быть короче 10с).
  const dur = probeDuration(dst);
  const stOut = Math.max(0.0, dur - FADE);
  const tmpFade = `${dst}.tmp2.wav`;
  runOk("ffmpeg", [
    "-y",
    "-i",
    dst,
    "-af",
    `afade=t=in:d=${FADE},afade=t=out:st=${stOut.toFixed(3)}:d=${FADE}`,
    "-ac",
    "1",
    "-ar",
    String(SR),
    tmpFade,
  ]);
  renameSync(tmpFade, dst);
  return true;
}
