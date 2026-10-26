// voice_bench.test.mts — тесты чистых функций бенч-харнесса движка.
// Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/voice_bench.test.mts
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { computeStats, mulberry32, parseBenchCli, parseShimGenLine, selectSample } from "./voice_bench.mts";

test("mulberry32: детерминирован — один seed = одна последовательность", () => {
  const a = Array.from({ length: 5 }, mulberry32(42));
  const b = Array.from({ length: 5 }, mulberry32(42));
  assert.deepEqual(a, b);
  const c = Array.from({ length: 5 }, mulberry32(43));
  assert.notDeepEqual(a, c);
});

test("selectSample: n элементов, стабильность по seed, без повторов", () => {
  const items = Array.from({ length: 100 }, (_, i) => i);
  const s1 = selectSample(items, 10, 7);
  const s2 = selectSample(items, 10, 7);
  assert.deepEqual(s1, s2);
  assert.equal(s1.length, 10);
  assert.equal(new Set(s1).size, 10); // без дублей
  assert.ok(s1.every((x) => items.includes(x)));
  // другой seed — другая выборка
  assert.notDeepEqual(s1, selectSample(items, 10, 8));
});

test("selectSample: n больше пула -> весь пул (без падения)", () => {
  const items = [1, 2, 3];
  assert.equal(selectSample(items, 10, 1).length, 3);
});

test("parseShimGenLine: строка шима -> длительность + чистый ген", () => {
  const r = parseShimGenLine("  pcm 6.60s (gen 24.3s)");
  assert.deepEqual(r, { rawDurSec: 6.6, genSec: 24.3 });
  assert.equal(parseShimGenLine("model loaded in 12.7s"), null);
  assert.equal(parseShimGenLine("  !! FAIL: ошибка"), null);
});

test("computeStats: mean/p50/p90 на известном массиве", () => {
  const s = computeStats([10, 20, 30, 40, 50]);
  assert.equal(s.n, 5);
  assert.equal(s.mean, 30);
  assert.equal(s.p50, 30);
  assert.equal(s.p90, 46); // линейная интерполяция: pos=3.6 -> 40 + 0.6*10
});

test("computeStats: пустой массив -> нули, не NaN", () => {
  const s = computeStats([]);
  assert.deepEqual(s, { n: 0, mean: 0, p50: 0, p90: 0 });
});

test("parseBenchCli: дефолты и разбор опций", () => {
  const o = parseBenchCli(["--tag", "B", "--n", "80", "--workers", "3", "--dry-run"]);
  assert.equal(o.tag, "B");
  assert.equal(o.n, 80);
  assert.equal(o.workers, 3);
  assert.equal(o.dryRun, true);
  assert.equal(o.lang, "ru");
  assert.equal(o.generationSeed, 42);
  assert.equal(o.sampleSeed, 42);
});

test("parseBenchCli: мусорная опция -> ошибка", () => {
  assert.throws(() => parseBenchCli(["--wat"]), /неизвестная опция/);
  assert.throws(() => parseBenchCli(["--n", "abc"]), /> 0/);
});
