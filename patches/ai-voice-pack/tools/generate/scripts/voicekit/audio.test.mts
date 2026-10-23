/**
 * audio.test.mts — тесты ffmpeg-цепочки voicekit/audio.mts.
 *
 * Нужны ffmpeg/ffprobe в PATH (в системе пайплайна есть; без них —
 * encode-тесты skip, заголовочные — всегда).
 *
 * ГЛАВНЫЙ ГАРД — формат корпуса: OpusHead original-rate == 24000
 * (behavioral: без выходного -ar в tensorToOpus loudnorm ресемплит до 192k
 * и libopus сам берёт 48000 — бага 2026-10-23, редактор владельца не
 * открывал такие файлы). Раньше этот фикс охранял текстовый гард по
 * cosyworker.py, теперь живёт здесь по-настоящему, через ffprobe.
 *
 * Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/voicekit/audio.test.mts
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { LOUD_ARGS, normalizeWav, opusPathFor, saveWavChain, tensorToOpus, wavToOpus, writeWav16 } from "./audio.mts";

const SR = 24000;
const HAS_FFMPEG = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const HAS_FFPROBE = spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;
const CAN_ENCODE = HAS_FFMPEG && HAS_FFPROBE;

let tmp: string;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), "audio-test-"));
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function sine(len: number, amp = 0.25): Float32Array {
  const a = new Float32Array(len);
  for (let i = 0; i < len; i++) a[i] = amp * Math.sin((2 * Math.PI * 1000 * i) / SR);
  return a;
}

/**
 * OpusHead original rate (ID-заголовок Ogg). ЕДИНСТВЕННО честный источник:
 * ffprobe stream.sample_rate для opus ВСЕГДА 48000 (нативная частота
 * декодирования), а корпусной контракт — поле original_rate=24000 в OpusHead
 * (проверено на корпусе: ffprobe 48000 + парсер 24000 — один и тот же файл).
 */
function opusHeadRate(path: string): number {
  const b = readFileSync(path);
  const i = b.indexOf("OpusHead", 0, "ascii");
  assert.ok(i >= 0, `нет magic OpusHead в ${path} — файл не opus?`);
  return b.readUInt32LE(i + 12);
}

function probe(path: string): { codec: string; rate: number; channels: number } {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_name,sample_rate,channels",
      "-of",
      "json",
      path,
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, `ffprobe упал: ${r.stderr}`);
  const s = JSON.parse(r.stdout).streams[0] as { codec_name: string; sample_rate: string; channels: number };
  return { codec: s.codec_name, rate: opusHeadRate(path), channels: s.channels };
}

describe("контракт уровня и путей (без ffmpeg)", () => {
  it("уровень корпуса: loudnorm I=-16 TP=-1.5 LRA=11 (AUDIO.loudness)", () => {
    assert.equal(LOUD_ARGS, "loudnorm=I=-16:TP=-1.5:LRA=11");
  });

  it("opusPathFor: расширение меняется, точки в папках не путаются", () => {
    assert.equal(opusPathFor("a/b/x.wav"), "a/b/x.opus");
    assert.equal(opusPathFor("C:/dir.v2/x.wav"), "C:/dir.v2/x.opus");
    assert.equal(opusPathFor("C:\\dir\\x.wav"), "C:\\dir\\x.opus");
    assert.equal(opusPathFor("noext"), "noext.opus");
  });

  it("writeWav16: RIFF/WAVE-заголовок, mono 24000 PCM16, data = n*2", () => {
    const wav = join(tmp, "hdr", "h.wav");
    const n = 1000;
    writeWav16(wav, new Float32Array(n), SR);
    const b = readFileSync(wav);
    assert.equal(b.toString("ascii", 0, 4), "RIFF");
    assert.equal(b.toString("ascii", 8, 12), "WAVE");
    assert.equal(b.readUInt32LE(16), 16, "fmt chunk");
    assert.equal(b.readUInt16LE(20), 1, "PCM");
    assert.equal(b.readUInt16LE(22), 1, "mono");
    assert.equal(b.readUInt32LE(24), SR, "sample rate");
    assert.equal(b.readUInt16LE(34), 16, "bits per sample");
    assert.equal(b.readUInt32LE(40), n * 2, "data chunk size");
    assert.equal(b.length, 44 + n * 2, "размер файла");
  });
});

describe("ffmpeg-кодирование", () => {
  it("tensorToOpus: OpusHead 24000 mono — гард формата корпуса (без -ar был бы 48000)", { skip: !CAN_ENCODE }, () => {
    const out = join(tmp, "pipe", "uid__Voice.wav");
    assert.equal(tensorToOpus(sine(SR * 1.5), SR, out), true, "pipe-конверт должен пройти");
    const opus = join(tmp, "pipe", "uid__Voice.opus");
    assert.ok(existsSync(opus), "opus создан");
    assert.ok(!existsSync(out), "wav в pipe-пути не создаётся");
    assert.ok(!existsSync(opus + ".part"), ".part не должен остаться");
    const p = probe(opus);
    assert.equal(p.codec, "opus");
    assert.equal(p.rate, 24000, `корпус = 24000, OpusHead = ${p.rate} — пропал выходной -ar?`);
    assert.equal(p.channels, 1);
  });

  it("wavToOpus + writeWav16: wav -> opus 24000 рядом", { skip: !CAN_ENCODE }, () => {
    const wav = join(tmp, "wav", "x.wav");
    writeWav16(wav, sine(SR), SR);
    assert.equal(wavToOpus(wav), true);
    const p = probe(join(tmp, "wav", "x.opus"));
    assert.equal(p.codec, "opus");
    assert.equal(p.rate, 24000);
    assert.ok(!existsSync(join(tmp, "wav", "x.opus.part")), ".part не должен остаться");
  });

  it("normalizeWav: in-place через tmp, сирот .ln.tmp.wav нет", { skip: !HAS_FFMPEG }, () => {
    const wav = join(tmp, "norm", "n.wav");
    writeWav16(wav, sine(SR * 2), SR);
    assert.equal(normalizeWav(wav), true);
    assert.ok(existsSync(wav));
    assert.ok(!existsSync(wav + ".ln.tmp.wav"));
  });

  it("saveWavChain: wav + opus рядом (фолбэк-цепочка)", { skip: !CAN_ENCODE }, () => {
    const wav = join(tmp, "chain", "c.wav");
    assert.equal(saveWavChain(sine(SR * 1.5), SR, wav), true, "wav-фолбэк-цепочка должна дать opus");
    assert.ok(existsSync(wav), "wav остаётся");
    assert.equal(probe(join(tmp, "chain", "c.opus")).rate, 24000);
  });
});
