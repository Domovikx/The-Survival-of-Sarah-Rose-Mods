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

import { measureLoudness } from "../voxcpm_bench.mts";
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

function probe(path: string): { codec: string; rate: number; channels: number; dur: number } {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_name,sample_rate,channels:format=duration",
      "-of",
      "json",
      path,
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, `ffprobe упал: ${r.stderr}`);
  const j = JSON.parse(r.stdout) as {
    streams: Array<{ codec_name: string; sample_rate: string; channels: number }>;
    format: { duration: string };
  };
  const s = j.streams[0];
  return { codec: s.codec_name, rate: opusHeadRate(path), channels: s.channels, dur: Number(j.format.duration) };
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

  it("tensorToOpus: ВХОД 48000 (VoxCPM2) -> всё равно OpusHead 24000", { skip: !CAN_ENCODE }, () => {
    const sr = 48000;
    const a = new Float32Array(sr * 1.5);
    for (let i = 0; i < a.length; i++) a[i] = 0.25 * Math.sin((2 * Math.PI * 1000 * i) / sr);
    const out = join(tmp, "pipe48", "uid__Voice.wav");
    assert.equal(tensorToOpus(a, sr, out), true, "pipe-конверт 48k должен пройти");
    const opus = join(tmp, "pipe48", "uid__Voice.opus");
    assert.ok(existsSync(opus), "opus создан");
    const p = probe(opus);
    // бага 2026-10-27: выходной -ar брался из ВХОДНОГО sr -> в VoxCPM2-прологе
    // 109 файлов легли с OpusHead 48000 (редактор владельца их не открывает)
    assert.equal(p.rate, 24000, `вход 48000, но корпус обязан остаться 24000 (OpusHead=${p.rate})`);
    assert.equal(p.channels, 1);
    assert.ok(Math.abs(p.dur - 1.5) < 0.3, `длительность потерялась при ресемпе 48k->24k: ${p.dur}s`);
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
    assert.ok(!existsSync(wav + ".gain.tmp.wav"));
  });

  it(
    "normalizeWav: двухпроходный — I попадает в -16 ±0.7 и для громкого, и для тихого (тунель громкости)",
    { skip: !HAS_FFMPEG },
    () => {
      const loud = join(tmp, "norm", "acc_loud.wav");
      writeWav16(loud, sine(SR * 4, 0.6), SR);
      assert.equal(normalizeWav(loud), true);
      const l1 = measureLoudness(loud);
      if (!l1 || l1.i === null || l1.tp === null) assert.fail("громкий: замер не прошёл");
      assert.ok(Math.abs(l1.i + 16) <= 0.7, `громкий: I=${l1.i} (ждём -16 ±0.7)`);
      assert.ok(l1.tp <= -1.4, `громкий: TP=${l1.tp} (лимит -1.5)`);

      const quiet = join(tmp, "norm", "acc_quiet.wav");
      writeWav16(quiet, sine(SR * 4, 0.02), SR);
      assert.equal(normalizeWav(quiet), true);
      const l2 = measureLoudness(quiet);
      if (!l2 || l2.i === null) assert.fail("тихий: замер не прошёл");
      assert.ok(Math.abs(l2.i + 16) <= 0.7, `тихий: I=${l2.i} (ждём -16 ±0.7)`);
    },
  );

  it("saveWavChain: wav + opus рядом (фолбэк-цепочка)", { skip: !CAN_ENCODE }, () => {
    const wav = join(tmp, "chain", "c.wav");
    assert.equal(saveWavChain(sine(SR * 1.5), SR, wav), true, "wav-фолбэк-цепочка должна дать opus");
    assert.ok(existsSync(wav), "wav остаётся");
    assert.equal(probe(join(tmp, "chain", "c.opus")).rate, 24000);
  });
});
