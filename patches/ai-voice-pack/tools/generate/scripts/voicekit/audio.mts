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
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
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
 * sr — частота ВХОДНОГО PCM модели; на ВЫХОДЕ всегда AUDIO.sr (24000):
 * корпусной контракт OpusHead original-rate == 24000 (редактор владельца
 * не открывает 48k-файлы, бага 2026-10-23). Для CosyVoice3 (sr=24000)
 * без изменений; VoxCPM2 отдаёт 48000 — там выходной -ar ресемпит в 24000
 * (иначе в корпусе появлялись 48k-файлы, проверено 2026-10-27 на прологе).
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
      String(Math.trunc(AUDIO.sr)),
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

/**
 * Атомарная конвертация wav -> opus mono рядом (wav уже нормализован).
 * sr — частота opus (корпусной контракт 24000; для экспериментов можно
 * 8000/12000/16000/48000 — у opus нет 36k-режима).
 */
export function wavToOpus(wavPath: string, sr: number = Math.trunc(AUDIO.sr)): boolean {
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
      // по умолчанию — контракт кози-корпуса (OpusHead 24000); Vox-стандарт: sr=48000
      "-ar",
      String(Math.trunc(sr)),
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

/**
 * WAV -> -16 LUFS / TP -1.5 in-place (ffmpeg в tmp -> rename). Паритет levelnorm.normalize_file.
 * @param sr частота выхода; по умолчанию контрактная AUDIO.sr (24000), а можно
 *   сохранить нативную частоту модели (VoxCPM2 — 48000, передаём из PCM).
 */
/**
 * Замер loudnorm (проход 1 двухпроходного выравнивания): measured_* из JSON
 * на stderr. Однопроходный loudnorm мажет на коротких файлах (разброс
 * −20.2..−12.9 LU на 213 файлах, жалоба владельца 2026-10-27 «то тише то
 * громче») — двухпроходность даёт точность ±0.5 LU.
 */
function measureLoud(path: string): { i: number; tp: number; lra: number; thresh: number } | null {
  try {
    const r = spawnSync(
      "ffmpeg",
      ["-hide_banner", "-i", path, "-af", `${LOUD_ARGS}:print_format=json`, "-f", "null", "-"],
      { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" },
    );
    if (r.status !== 0 || !r.stderr) return null;
    const blocks = r.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/g);
    if (!blocks || blocks.length === 0) return null;
    const j = JSON.parse(blocks[blocks.length - 1]) as Record<string, string>;
    const i = Number(j.input_i);
    const tp = Number(j.input_tp);
    if (!Number.isFinite(i) || !Number.isFinite(tp)) return null;
    const lra = Number(j.input_lra);
    const th = Number(j.input_thresh);
    return { i, tp, lra: Number.isFinite(lra) ? lra : 11, thresh: Number.isFinite(th) ? th : -70 };
  } catch {
    return null;
  }
}

/** Аргументы кодека на выходе: wav — ресемпл; opus — частота из параметра sr
 * (OpusHead original_rate: 24000 — кози-контракт, 48000 — Vox-стандарт),
 * битрейт 24 kbps общий для обоих. */
function outEncode(fmt: "wav" | "opus", sr: number): string[] {
  return fmt === "opus"
    ? ["-c:a", "libopus", "-b:a", "24k", "-ac", "1", "-ar", String(Math.trunc(sr))]
    : ["-ac", "1", "-ar", String(Math.trunc(sr))];
}

/** OpusHead original_rate — ЕДИНСТВЕННО честный источник частоты opus (ffprobe
 * для opus всегда врёт 48000 — это частота декодирования). null, если файл
 * не распознан как Ogg/Opus. */
function readOpusRate(path: string): number | null {
  try {
    const b = readFileSync(path);
    if (b.length < 28 || b.subarray(0, 4).toString("latin1") !== "OggS") return null;
    const off = 27 + (b[26] ?? 0); // payload первого Ogg-page после сегментной таблицы
    if (b.subarray(off, off + 8).toString("latin1") !== "OpusHead") return null;
    const rate = b.readUInt32LE(off + 12);
    return rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

/** Проход 2: loudnorm по measured-параметрам; linear=true — без изменения динамики,
 * false — динамический (для TP-упёртых спайковых файлов, которые линейный не выравнивает). */
function loudnormPass(
  path: string,
  m: { i: number; tp: number; lra: number; thresh: number },
  sr: number,
  out: string,
  linear: boolean,
  fmt: "wav" | "opus" = "wav",
): boolean {
  const af =
    `${LOUD_ARGS}:measured_I=${m.i}:measured_TP=${m.tp}:measured_LRA=${m.lra}` +
    `:measured_thresh=${m.thresh}:linear=${linear}:print_format=json`;
  return runFfmpeg(["-y", "-loglevel", "error", "-i", path, "-af", af, ...outEncode(fmt, sr), out]);
}

/** Статическая коррекция уровня (gain) — добивает остаток без изменения динамики. */
function applyGainDb(path: string, gainDb: number, sr: number, out: string, fmt: "wav" | "opus" = "wav"): boolean {
  return runFfmpeg([
    "-y",
    "-loglevel",
    "error",
    "-i",
    path,
    "-af",
    `volume=${gainDb.toFixed(2)}dB`,
    ...outEncode(fmt, sr),
    out,
  ]);
}

function normalizeFile(path: string, sr: number, fmt: "wav" | "opus"): boolean {
  const tmp = path + (fmt === "opus" ? ".ln.tmp.opus" : ".ln.tmp.wav");
  const tmpGain = path + (fmt === "opus" ? ".gain.tmp.opus" : ".gain.tmp.wav");
  try {
    const srI = Math.trunc(sr);
    const target = Number(AUDIO.loudness.i);
    const tpMax = Number(AUDIO.loudness.tp);
    const m = measureLoud(path);
    if (m) {
      // Ранний выход: файл уже в тунеле — не трогаем (экономит ffmpeg-прогоны)
      if (Math.abs(target - m.i) <= 0.3 && m.tp <= tpMax + 0.05) return true;
      // Проход 2: линейный loudnorm по замеру (динамику не меняет)
      if (!loudnormPass(path, m, srI, tmp, true, fmt)) {
        tryRemove(tmp);
        return false;
      }
      renameSync(tmp, path);
      // Контроль: остаток |I - target| добиваем стат-гейном (чистое усиление,
      // без лимитеров/компрессии — фильтр после судьи обязан быть БЕЗ
      // искажений, решение владельца 2026-10-27). TP первичен: упёртые
      // в TP остаются чуть тише тунеля, чем искажаться. На СЫРОМ материале
      // (генерация без фильтров) пиков до TP обычно нет — линейного хватает.
      const m2 = measureLoud(path);
      if (m2) {
        let gain = target - m2.i;
        if (Math.abs(gain) > 0.4) {
          if (m2.tp + gain > tpMax) gain = tpMax - m2.tp;
          if (Math.abs(gain) >= 0.1 && applyGainDb(path, gain, srI, tmpGain, fmt)) {
            renameSync(tmpGain, path);
          } else {
            tryRemove(tmpGain);
          }
        }
      }
      return true;
    }
    // Фолбэк (замер недоступен): прежний однопроходный loudnorm
    const args = ["-y", "-loglevel", "error", "-i", path, "-af", LOUD_ARGS, ...outEncode(fmt, srI), tmp];
    if (!runFfmpeg(args)) {
      tryRemove(tmp);
      return false;
    }
    renameSync(tmp, path);
    return true;
  } catch {
    tryRemove(tmp);
    tryRemove(tmpGain);
    return false;
  }
}

/**
 * Выравнивание WAV in-place (-16/TP-1.5, двухпроходно, без искажений).
 * @param sr частота выхода; по умолчанию контрактная AUDIO.sr (24000), можно
 *   сохранить нативную частоту модели (VoxCPM2 — 48000, передаём из PCM).
 */
export function normalizeWav(path: string, sr: number = Math.trunc(AUDIO.sr)): boolean {
  return normalizeFile(path, sr, "wav");
}

/**
 * Выравнивание OPUS in-place: вход opus -> выход opus, частота СОХРАНЯЕТСЯ из
 * OpusHead (кози-корпус 24000 / Vox-стандарт 48000 — НИКОГДА не понижаем),
 * битрейт 24k. Осознанный компромисс 2026-10-28: это ВТОРОЕ поколение lossy-
 * сжатия (как и чистка рефов); альтернатива — пересборка wav-путём
 * (регенерация -> normalizeWav -> wavToOpus).
 */
export function normalizeOpus(path: string): boolean {
  return normalizeFile(path, readOpusRate(path) ?? Math.trunc(AUDIO.sr), "opus");
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
