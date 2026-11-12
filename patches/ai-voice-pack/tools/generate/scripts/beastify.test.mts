/** Тесты beastify.mts — чистые функции (цепочки ffmpeg), без самого ffmpeg. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildChain, type BeastPreset } from "./beastify.mts";
import { BEASTIFY } from "./voice_presets.mts";

test("buildChain: orc — строка идентична python-оригиналу (beastify.py)", () => {
  const orc = (BEASTIFY as Record<string, BeastPreset>).orc;
  // round(1/0.84, 5) = 1.19048; asetrate={sr}*{k} считает сам ffmpeg
  assert.equal(
    buildChain(orc, 24000),
    "asetrate=24000*0.84,aresample=24000,atempo=1.19048," +
      "bass=g=4:f=120,highshelf=f=4000:g=-8," +
      "acompressor=threshold=-25dB:ratio=3:attack=5:release=80," +
      "acrusher=bits=12:mode=log:aa=1",
  );
});

test("buildChain: atempo = 1/k с точностью 5 знаков (все пресеты)", () => {
  for (const [name, pr] of Object.entries(BEASTIFY as Record<string, BeastPreset>)) {
    const chain = buildChain(pr, 24000);
    const m = /^asetrate=24000\*([0-9.]+),aresample=24000,atempo=([0-9.]+),/.exec(chain);
    assert.ok(m, `${name}: нет pitch-префикса`);
    assert.ok(Math.abs(Number(m[1]) * Number(m[2]) - 1) < 1e-4, `${name}: k*atempo != 1`);
    assert.match(m[2], /^\d+\.\d{5}$/, `${name}: atempo не 5 знаков`);
  }
});

test("пресеты: k в разумных границах (щадящий pitch, не октава)", () => {
  for (const [name, pr] of Object.entries(BEASTIFY as Record<string, BeastPreset>)) {
    assert.ok(pr.k > 0.5 && pr.k <= 1.1, `${name}: k=${pr.k} вне 0.5..1.1`);
    assert.ok(pr.chain.length > 0, `${name}: пустая цепочка`);
  }
});
