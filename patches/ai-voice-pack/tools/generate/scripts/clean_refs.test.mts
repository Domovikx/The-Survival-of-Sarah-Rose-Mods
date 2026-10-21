/**
 * clean_refs.test.mts — тесты чистки рефов (ПОРТ test_clean_refs.py, 8 кейсов).
 *
 * ffmpeg-кейсы пропускаются, если ffmpeg не найден (как python skip).
 * Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/clean_refs.test.mts
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { cleanFile, compressPauses, measureLoudness, runOk } from "./clean_refs.mts";

const HAS_FFMPEG = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;

let tmp: string;
const made: string[] = [];

function tmpFile(name: string): string {
  const p = join(tmp, name);
  made.push(p);
  return p;
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), "clean-refs-test-"));
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** 5-секундный синусоидальный тон (как python sample_wav). */
function sineWav(name: string, freq = 440, dur = 5): string {
  const p = tmpFile(name);
  runOk("ffmpeg", ["-y", "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${dur}`, "-ac", "1", "-ar", "24000", p]);
  return p;
}

/** Синтетический сигнал из тонов/тишины для compressPauses. */
function concat(...parts: Float32Array[]): Float32Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function tone(sr: number, sec: number): Float32Array {
  const n = Math.floor(sr * sec);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * 220 * i) / sr) * 0.3;
  return x;
}

function silence(sr: number, sec: number): Float32Array {
  return new Float32Array(Math.floor(sr * sec));
}

describe("clean_refs.mts", { skip: HAS_FFMPEG ? false : "ffmpeg не найден" }, () => {
  it("cleanFile создаёт выходной файл", () => {
    const src = sineWav("basic-src.wav");
    const dst = tmpFile("basic-dst.wav");
    const result = cleanFile(src, dst);
    assert.equal(result, true);
    assert.ok(existsSync(dst));
    assert.ok(statSync(dst).size > 0);
  });

  it("cleanFile пропускает существующий файл", () => {
    const src = sineWav("skip-src.wav");
    const dst = tmpFile("skip-dst.wav");
    writeFileSync(dst, Buffer.from("existing"));
    const result = cleanFile(src, dst);
    assert.equal(result, false);
    assert.deepEqual(readFileSync(dst), Buffer.from("existing"));
  });

  it("cleanFile нормализует до -16 LUFS ±1", () => {
    const src = sineWav("loud-src.wav");
    const dst = tmpFile("loud-dst.wav");
    cleanFile(src, dst);
    const stats = measureLoudness(dst);
    const inputI = Number.parseFloat(stats.input_i ?? "-99");
    assert.ok(inputI >= -17 && inputI <= -15, `Громкость ${inputI} LUFS вне диапазона [-17, -15]`);
  });

  it("cleanFile применяет всю цепочку фильтров без ошибок", () => {
    const src = sineWav("chain-src.wav");
    const dst = tmpFile("chain-dst.wav");
    cleanFile(src, dst);
    assert.ok(existsSync(dst));
  });

  it("cleanFile обрабатывает несколько файлов", () => {
    for (let i = 0; i < 3; i++) {
      const src = sineWav(`multi-src-${i}.wav`, 440 + i * 100, 2);
      const dst = tmpFile(`multi-dst-${i}.wav`);
      const result = cleanFile(src, dst);
      assert.equal(result, true);
      assert.ok(existsSync(dst));
    }
  });
});

describe("compressPauses", () => {
  const SR = 24000;

  it("длинная пауза сжимается до target, короткая не трогается", () => {
    const x = concat(tone(SR, 1), silence(SR, 2.0), tone(SR, 1), silence(SR, 0.3), tone(SR, 1));
    const { y, maxPause, nCut } = compressPauses(x, SR);
    assert.equal(nCut, 1);
    assert.ok(maxPause >= 2.0, `maxPause ${maxPause}`);
    assert.ok(Math.abs(y.length / SR - (1 + 0.35 + 1 + 0.3 + 1)) < 0.1, `длина ${y.length / SR}`);
  });

  it("без длинных пауз файл не меняется", () => {
    const x = concat(tone(SR, 1), silence(SR, 0.3), tone(SR, 1));
    const { y, nCut } = compressPauses(x, SR);
    assert.equal(nCut, 0);
    assert.equal(y.length, x.length);
  });

  it("пауза 0.5с (длиннее target 0.35) сжимается до 0.35", () => {
    const x = concat(tone(SR, 1), silence(SR, 0.5), tone(SR, 1));
    const { y, nCut } = compressPauses(x, SR);
    assert.equal(nCut, 1);
    assert.ok(Math.abs(y.length / SR - (1 + 0.35 + 1)) < 0.1, `длина ${y.length / SR}`);
  });
});
