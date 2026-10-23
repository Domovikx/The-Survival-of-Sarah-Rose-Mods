/**
 * trim.test.mts — паритет порта voicekit/trim.mts с trim_tail_burst.py.
 *
 * Случаи отрабатывают каждую ветку find_tail_burst/trim из python-эталона
 * (паттерн найден / не найден по каждой причине, цепочка итераций,
 * ветка max_tail_silence с фейдом linspace). Миграция python → TS:
 * расхождение порта с эталоном = сломанный хвост реплик в 134k файлах,
 * поэтому тесты считают кадры вручную.
 *
 * Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/voicekit/trim.test.mts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findTailBurst, rmsDbFrames, trimTailBurst } from "./trim.mts";

const SR = 24000;
const FRAME = 240; // SR * FRAME_MS / 1000

/** Синус с целым числом периодов в кадре (1000 Гц @ 24k = 24 сэмпла/период): RMS = amp/√2. */
function sine(len: number, amp = 0.3): Float32Array {
  const a = new Float32Array(len);
  for (let i = 0; i < len; i++) a[i] = amp * Math.sin((2 * Math.PI * 1000 * i) / SR);
  return a;
}

function concat(...parts: Float32Array[]): Float32Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const LOUD = -13.5; // 20*log10(0.3/√2) — уверенно выше пола -50 dB
const SILENT = -200;

describe("rmsDbFrames", () => {
  it("кадр 10мс, dB по RMS (сигнал -13.5, тишина ниже порога)", () => {
    const { db, frame } = rmsDbFrames(sine(FRAME * 10), SR);
    assert.equal(frame, FRAME);
    assert.equal(db.length, 10);
    for (const v of db) assert.ok(Math.abs(v - LOUD) < 0.1, `ожидали ~${LOUD}, получили ${v}`);
    const zeros = rmsDbFrames(new Float32Array(FRAME * 3), SR);
    for (const v of zeros.db) assert.ok(v <= -100, `тишина должна быть глубокой: ${v}`);
  });

  it("неполный хвостовой кадр отбрасывается (как // в python)", () => {
    const { db } = rmsDbFrames(sine(FRAME * 3 + 7), SR);
    assert.equal(db.length, 3);
  });
});

describe("findTailBurst", () => {
  /** db из кадров: [loud, silent, loud] — собираем по количеству кадров. */
  function makeDb(...runs: Array<{ n: number; v: number }>): number[] {
    const db: number[] = [];
    for (const r of runs) for (let i = 0; i < r.n; i++) db.push(r.v);
    return db;
  }

  it("пустой db и весь файл тихой -> null", () => {
    assert.equal(findTailBurst([]), null);
    assert.equal(findTailBurst(makeDb({ n: 50, v: SILENT })), null);
  });

  it("классика: речь -> пауза 200мс -> всплеск 150мс у EOF", () => {
    const db = makeDb({ n: 100, v: LOUD }, { n: 20, v: SILENT }, { n: 15, v: LOUD });
    const info = findTailBurst(db);
    assert.ok(info, "паттерн должен найтись");
    assert.equal(info.burstStartFrame, 120);
    assert.equal(info.burstEndFrame, 134);
    assert.equal(info.durMs, 150);
    assert.equal(info.gapMs, 200);
    assert.equal(info.peakDb, LOUD);
  });

  it("всплеск длиннее 500мс -> null", () => {
    const db = makeDb({ n: 100, v: LOUD }, { n: 10, v: SILENT }, { n: 51, v: LOUD });
    assert.equal(findTailBurst(db), null);
  });

  it("после всплеска тишина дальше 100мс от EOF -> null", () => {
    const db = makeDb({ n: 100, v: LOUD }, { n: 20, v: SILENT }, { n: 15, v: LOUD }, { n: 20, v: SILENT });
    assert.equal(findTailBurst(db), null);
  });

  it("пауза перед всплеском короче 80мс -> null", () => {
    const db = makeDb({ n: 100, v: LOUD }, { n: 5, v: SILENT }, { n: 15, v: LOUD });
    assert.equal(findTailBurst(db), null);
  });

  it("весь файл одним всплеском (речи перед паузой нет) -> null", () => {
    // тишина 1000мс, потом речь до EOF: burst_start_frame=100, k уходит в -1
    const db = makeDb({ n: 100, v: SILENT }, { n: 15, v: LOUD });
    assert.equal(findTailBurst(db), null);
  });

  it("без тишины перед всплеском (сплошная речь) -> null", () => {
    const db = makeDb({ n: 115, v: LOUD });
    assert.equal(findTailBurst(db), null);
  });
});

describe("trimTailBurst", () => {
  it("цепочка двух итераций: режет всплески с конца, эталонные cutAtMs", () => {
    // A 100мс речь + 90мс тишина + B 300мс + 90мс тишина + C 150мс у EOF
    const input = concat(
      sine(FRAME * 10),
      new Float32Array(FRAME * 9),
      sine(FRAME * 30),
      new Float32Array(FRAME * 9),
      sine(FRAME * 15),
    );
    assert.equal(input.length, FRAME * 73);

    const orig = input.slice();
    const { samples, cuts } = trimTailBurst(input, SR);

    // итерация 1: всплеск C (кадр 58) -> отрез, итерация 2: всплеск B (кадр 19) -> отрез,
    // итерация 3: остаток A+пауза — паттерна нет (rечь упирается в начало файла)
    assert.equal(cuts.length, 2, `ожидали 2 выреза, получили ${JSON.stringify(cuts)}`);
    assert.equal(cuts[0].durMs, 150);
    assert.equal(cuts[0].gapMs, 90);
    assert.ok(Math.abs(cuts[0].cutAtMs - 580) < 1e-6);
    assert.equal(cuts[1].durMs, 300);
    assert.equal(cuts[1].gapMs, 90);
    assert.ok(Math.abs(cuts[1].cutAtMs - 190) < 1e-6);
    assert.equal(samples.length, FRAME * 19);

    // вход не мутирован
    assert.equal(input.length, orig.length);
    assert.deepEqual(input, orig);
  });

  it("без паттерна -> те же семплы, 0 вырезов", () => {
    const input = sine(FRAME * 60);
    const { samples, cuts } = trimTailBurst(input, SR);
    assert.equal(cuts.length, 0);
    assert.equal(samples.length, input.length);
    assert.deepEqual(samples, input);
  });

  it("весь файл тихой -> без вырезов (и без исключения)", () => {
    const { samples, cuts } = trimTailBurst(new Float32Array(FRAME * 100), SR);
    assert.equal(cuts.length, 0);
    assert.equal(samples.length, FRAME * 100);
  });

  it("maxTailSilenceMs: хвост срезается до лимита, фейд = linspace(1,0,f)", () => {
    const input = concat(sine(FRAME * 50), new Float32Array(FRAME * 50)); // 500мс речи + 500мс тишины
    const { samples, cuts } = trimTailBurst(input, SR, { maxTailSilenceMs: 10 });
    assert.equal(cuts.length, 0, "паттерн всплеска не задействован");
    // keep = 50 громких кадров + 10/10 кадров тишины
    assert.equal(samples.length, FRAME * 51);
    const f = (SR * 20) / 1000; // 480 сэмплов фейда
    const fadeStart = samples.length - f; // внутри громкой части: 12240-480=11760 < 12000
    assert.ok(fadeStart < FRAME * 50, "фейд должен заходить на громкую часть");
    assert.equal(samples[fadeStart], input[fadeStart], "x=0: множитель 1 (концы linspace включительно)");
    const x = 6; // x=6: сэмпл на пике синуса, форма множителя читается точно
    assert.ok(
      Math.abs(samples[fadeStart + x] - input[fadeStart + x] * (1 - x / (f - 1))) < 1e-6,
      "множитель кадра = 1 - x/(f-1) — как torch.linspace(1.0, 0.0, f)",
    );
    assert.equal(samples[samples.length - 1], 0, "x=f-1: последний сэмпл = 0");
    assert.equal(input.length, FRAME * 100, "вход не мутирован");
  });
});
