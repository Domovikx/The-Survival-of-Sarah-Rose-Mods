/**
 * audio.mts — ffmpeg-цепочка кодирования реплик (порт cosyworker.py
 * {tensor_to_opus, wav_to_opus, save_wav_chain} + levelnorm.normalize_file).
 *
 * Миграция python → TS (AGENTS.md «Миграция python → TypeScript»): шим
 * cosyworker.py отдаёт сырой PCM (base64), всё после инференса — здесь
 * (worker.mts.generate зовёт эти функции). Python больше ffmpeg не трогает.
 *
 * Формат — корпусный (134k файлов): Opus 24k mono, уровень -16 LUFS / TP -1.5
 * (LOUD_ARGS из voice_presets.mts AUDIO.loudness — единственный источник
 * правды, как когда-то levelnorm.LOUD_ARGS).
 *
 * Выходной '-ar' ОБЯЗАТЕЛЕН (фикс 2026-10-23): loudnorm ресемплит до 192k,
 * после чего libopus без явного -ar сам выбирает 48000 — OpusHead
 * original-rate 48000 вместо 24000, и редактор владельца не открывает такие
 * файлы (весь корпус — 24000). Явный -ar sr возвращает корпусной формат;
 * гард — behavioral-тест с ffprobe в audio.test.mts.
 *
 * Fail-soft как в python: любой сбой ffmpeg -> false, вызывающая сторона
 * оставляет wav-фолбэк (игра ищет opus -> wav). .part защищает от битого
 * opus при обрыве.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { AUDIO } from "../voice_presets.mts";

/** Уровень корпуса: loudnorm=-16 LUFS / TP -1.5 / LRA 11 (из AUDIO.loudness). */
export const LOUD_ARGS = `loudnorm=I=${AUDIO.loudness.i}:TP=${AUDIO.loudness.tp}:LRA=${AUDIO.loudness.lra}`;

/** Таймаут одного ffmpeg-прогона, с (паритет subprocess timeout=120). */
const FFMPEG_TIMEOUT_MS = 120_000;

/** opus-путь рядом с wav (паритет os.path.splitext). */
export function opusPathFor(wavPath: string): string {
  const dot = wavPath.lastIndexOf(".");
  const sep = Math.max(wavPath.lastIndexOf("/"), wavPath.lastIndexOf("\\"));
  return dot > sep ? wavPath.slice(0, dot) + ".opus" : wavPath + ".opus";
}

/** Один прогон ffmpeg (без парсинга stderr — как python capture_output). */
function runFfmpeg(args: string[], input?: Buffer): boolean {
  try {
    const r = spawnSync("ffmpeg", args, {
      input,
      timeout: FFMPEG_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      stdio: input === undefined ? ["ignore", "ignore", "pipe"] : ["pipe", "ignore", "pipe"],
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

function tryRemove(p: string): void {
  try {
    if (existsSync(p)) rmSync(p, { force: true });
  } catch {
    /* сирота .part не критична — паритет python-очисток */
  }
}

/** .part -> атомарный rename в .opus; пустой/битый -> удалить и false. */
function partToOpus(part: string, opus: string): boolean {
  if (existsSync(part) && statSync(part).size > 0) {
    renameSync(part, opus);
    return true;
  }
  tryRemove(part);
  return false;
}

/**
 * Сырой PCM (mono float32) -> opus 24k mono ОДНИМ ffmpeg-проходом, без wav.
 *
 * f32le pipe -> loudnorm (LOUD_ARGS) -> libopus 24k -> .part -> rename.
 * sr — целое (sample_rate модели = 24000).
 */
export function tensorToOpus(samples: Float32Array, sr: number, outWavPath: string): boolean {
  const opus = opusPathFor(outWavPath);
  const part = opus + ".part";
  try {
    mkdirSync(dirname(opus), { recursive: true });
    const pcm = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
    const args = [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "f32le",
      "-ar",
      String(sr),
      "-ac",
      "1",
      "-i",
      "pipe:0",
      "-af",
      LOUD_ARGS,
      "-c:a",
      "libopus",
      "-b:a",
      "24k",
      "-ac",
      "1",
      "-ar",
      String(sr),
      "-f",
      "opus",
      part,
    ];
    if (!runFfmpeg(args, pcm)) {
      tryRemove(part);
      return false;
    }
    return partToOpus(part, opus);
  } catch {
    tryRemove(part);
    return false;
  }
}

/** Атомарная конвертация wav -> opus 24k mono рядом (wav уже нормализован). */
export function wavToOpus(wavPath: string): boolean {
  const opus = opusPathFor(wavPath);
  const part = opus + ".part";
  try {
    const args = [
      "-y",
      "-loglevel",
      "error",
      "-i",
      wavPath,
      "-c:a",
      "libopus",
      "-b:a",
      "24k",
      "-ac",
      "1",
      "-f",
      "opus",
      part,
    ];
    if (!runFfmpeg(args)) {
      tryRemove(part);
      return false;
    }
    return partToOpus(part, opus);
  } catch {
    tryRemove(part);
    return false;
  }
}

/** WAV -> -16 LUFS / TP -1.5 in-place (ffmpeg в tmp -> rename). Паритет levelnorm.normalize_file. */
export function normalizeWav(path: string): boolean {
  const tmp = path + ".ln.tmp.wav";
  try {
    const args = [
      "-y",
      "-loglevel",
      "error",
      "-i",
      path,
      "-af",
      LOUD_ARGS,
      "-ac",
      "1",
      "-ar",
      String(Math.trunc(AUDIO.sr)),
      tmp,
    ];
    if (!runFfmpeg(args)) {
      tryRemove(tmp);
      return false;
    }
    renameSync(tmp, path);
    return true;
  } catch {
    tryRemove(tmp);
    return false;
  }
}

/** WAV PCM16 mono (паритет torchaudio.save encoding='PCM_S', bits_per_sample=16). */
export function writeWav16(path: string, samples: Float32Array, sr: number): void {
  const srI = Math.trunc(sr);
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // размер fmt-чанка
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(srI, 24);
  buf.writeUInt32LE(srI * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // бит на сэмпл
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
}

/**
 * Старая цепочка (она же wav-фолбэк): wav -> levelnorm -> opus рядом.
 * @returns true, если opus создан; false — wav остаётся фолбэком.
 */
export function saveWavChain(samples: Float32Array, sr: number, wavPath: string): boolean {
  writeWav16(wavPath, samples, sr);
  normalizeWav(wavPath); // сбой не фатален — паритет python (try/except: pass)
  return wavToOpus(wavPath);
}
