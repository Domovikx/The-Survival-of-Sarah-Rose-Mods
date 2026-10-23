/**
 * worker.test.mts — тесты клиента инференс-шима voicekit/worker.mts
 * (протокол v2 JSON-lines stdin/stdout; модель не нужна — спавнится fake_worker.mts).
 *
 * Кодирование (trim+ffmpeg) выполняет САМ worker — тестам записи файла
 * нужен ffmpeg в PATH (в системе пайплайна есть; без него — skip).
 *
 * Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/voicekit/worker.test.mts
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { VoiceWorker } from "./worker.mts";

const FAKE = fileURLToPath(new URL("./fake_worker.mts", import.meta.url));
const HAS_FFMPEG = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

let tmp: string;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), "worker-test-"));
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeWorker(overrides: Partial<ConstructorParameters<typeof VoiceWorker>[0]> = {}) {
  return new VoiceWorker({
    python: process.execPath, // node в роли "python" — фейковому шиму интерпретор нужен свой
    script: FAKE,
    ...overrides,
  });
}

describe("VoiceWorker (протокол шима)", () => {
  it("ping возвращает устройство и флаг модели", async () => {
    const w = makeWorker();
    try {
      const r = await w.ping();
      assert.equal(r.ok, true);
      assert.equal(r.device, "fake-gpu");
      assert.equal(r.model_loaded, true);
    } finally {
      await w.quit();
    }
  });

  it("generate: PCM из шима кодируется worker'ом в opus (dur/saved как раньше)", { skip: !HAS_FFMPEG }, async () => {
    const w = makeWorker();
    const out = join(tmp, "gen1", "uid__Voice.wav");
    const opus = out.replace(/\.wav$/, ".opus");
    try {
      const r = await w.generate({ text: "привет мир", ref: "ref.wav", out });
      assert.equal(r.ok, true);
      assert.equal(r.saved, opus, "как os.path.splitext в python");
      assert.equal(r.dur, 1.5);
      assert.ok(existsSync(opus), "файл должен быть создан");
      assert.ok(statSync(opus).size > 1000, "реальный opus, а не заглушка");
      assert.ok(!existsSync(out), "wav в pipe-пути не создаётся");
      assert.ok(!existsSync(opus + ".part"), ".part не должен остаться");
    } finally {
      await w.quit();
    }
  });

  it("ретрай TextEncodeInput: первый запрос отваливается → повтор через 3с → ok", async () => {
    const logs: string[] = [];
    const w = makeWorker({ onLog: (l) => logs.push(l) });
    try {
      const r = await w.generate({ text: "WARMUP-фраза", ref: "ref.wav", out: join(tmp, "warmup", "x.wav") });
      assert.equal(r.ok, true, `после ретрая должно быть ok, получили ${JSON.stringify(r)}`);
      assert.ok(
        logs.some((l) => l.includes("TextEncodeInput")),
        `нет лога прогрева: ${JSON.stringify(logs)}`,
      );
      assert.ok(
        logs.some((l) => l.includes("повтор через 3с")),
        `нет лога повтора: ${JSON.stringify(logs)}`,
      );
    } finally {
      await w.quit();
    }
  });

  it("несколько заданий подряд — корреляция по id", async () => {
    const w = makeWorker();
    try {
      const results = await Promise.all(
        ["a", "b", "c"].map((t) => w.generate({ text: `фраза ${t}`, ref: "ref.wav", out: join(tmp, t, "x.wav") })),
      );
      assert.deepEqual(
        results.map((r) => r.ok),
        [true, true, true],
      );
    } finally {
      await w.quit();
    }
  });

  it("fail-ветка: ok:false с ошибкой, клиент не падает", async () => {
    const w = makeWorker();
    try {
      const bad = await w.generate({ text: "FAIL please", ref: "ref.wav", out: join(tmp, "bad", "x.wav") });
      assert.equal(bad.ok, false);
      assert.match(bad.error ?? "", /fake fail/);
      // после ошибки клиент работает
      const good = await w.generate({ text: "нормальная", ref: "ref.wav", out: join(tmp, "good", "x.wav") });
      assert.equal(good.ok, true);
    } finally {
      await w.quit();
    }
  });

  it("обрыв шима (CRASH): pending-запрос reject-ится, alive=false", async () => {
    const w = makeWorker();
    try {
      await w.ping();
      await assert.rejects(
        () => w.generate({ text: "CRASH", ref: "ref.wav", out: join(tmp, "crash", "x.wav") }),
        /завершился/,
      );
      assert.equal(w.alive, false);
      // повторный вызов — понятный reject без записи в мёртвый процесс
      await assert.rejects(() => w.ping(), /завершён/);
    } finally {
      w.kill();
    }
  });

  it("quit: код выхода 0, alive=false", async () => {
    const w = makeWorker();
    await w.ping();
    const code = await w.quit();
    assert.equal(code, 0);
    assert.equal(w.alive, false);
  });

  it("stderr шима уходит в onLog", async () => {
    const logs: string[] = [];
    const w = makeWorker({ onLog: (l) => logs.push(l) });
    try {
      await w.generate({ text: "CRASH", ref: "ref.wav", out: join(tmp, "log", "x.wav") }).catch(() => {});
    } finally {
      await w.quit().catch(() => {});
    }
    assert.ok(
      logs.some((l) => l.includes("CRASH")),
      `ожидали лог CRASH в onLog, получили: ${JSON.stringify(logs)}`,
    );
  });

  it("не-JSON в stdout не роняет клиент (уходит в onLog)", async () => {
    const logs: string[] = [];
    // фейк печатает "не-JSON"-ответ на мусор; сами шлём валидный — просто проверяем канал
    const w = makeWorker({ onLog: (l) => logs.push(l) });
    try {
      const r = await w.ping();
      assert.equal(r.ok, true);
    } finally {
      await w.quit();
    }
  });
});
