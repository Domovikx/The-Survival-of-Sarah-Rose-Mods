/**
 * Тесты прогресса полной озвучки: скорость по mtime и фильтр имён.
 * Ключевое правило: файл бенча `{uid}__{voice}__Vox...` — НЕ озвучка (игра его
 * не находит), поэтому он не должен попадать ни в счёт, ни в скорость.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { isRecording, rateFrom, scanCorpus, siteModule, type CorpusFile } from "./voice_progress.mts";

const MIN = 60_000;
const CONTRACT = "IDQ3UEAURZD5-VXIODG Carolyn.opus";
const JUNK = "007b60073b571d0af7c8a8b2a95e3dc1__Narrator__Vox_cfg2.6_ts30_dn.opus";

const file = (mtimeMs: number, arc = "Prologue"): CorpusFile => ({ arc, name: CONTRACT, mtimeMs });

test("rateFrom: файлы за окно делим на реальный интервал от самого старого", () => {
  const now = 1_000 * MIN;
  // 3 файла за последние 10 минут → 3 / 10 = 0.3 файла/мин
  const files = [file(now - 10 * MIN), file(now - 5 * MIN), file(now - 1 * MIN)];
  const rate = rateFrom(files, now);
  assert.ok(rate !== null);
  assert.ok(Math.abs(rate! - 0.3) < 1e-9, `получено ${rate}`);
});

test("rateFrom: старые файлы (за окном) не участвуют", () => {
  const now = 1_000 * MIN;
  const files = [file(now - 120 * MIN), file(now - 180 * MIN), file(now - 2 * MIN), file(now - 1 * MIN)];
  const rate = rateFrom(files, now);
  assert.ok(rate !== null);
  // окно: 2 файла, интервал между ними 1 мин, но минимум 5 → 2/5 = 0.4
  assert.ok(Math.abs(rate! - 0.4) < 1e-9, `получено ${rate}`);
});

test("rateFrom: меньше двух файлов — скорости нет (а не ноль)", () => {
  assert.equal(rateFrom([file(1_000 * MIN - MIN)], 1_000 * MIN), null);
  assert.equal(rateFrom([], 1_000 * MIN), null);
});

test("isRecording: запись идёт, пока последний файл свежий", () => {
  const now = 1_000 * MIN;
  assert.equal(isRecording([file(now - 2 * MIN)], now), true);
  assert.equal(isRecording([file(now - 30 * MIN)], now), false);
  assert.equal(isRecording([], now), false);
});

test("scanCorpus: файл бенча в корпус не попадает, контрактный — попадает", () => {
  const dir = mkdtempSync(join(tmpdir(), "tssr-voice-progress-"));
  try {
    mkdirSync(join(dir, "en", "Prologue"), { recursive: true });
    writeFileSync(join(dir, "en", "Prologue", CONTRACT), "x");
    writeFileSync(join(dir, "en", "Prologue", JUNK), "x");
    writeFileSync(join(dir, "en", "Prologue", "notes.txt"), "x");
    utimesSync(join(dir, "en", "Prologue", CONTRACT), new Date(), new Date());
    const files = scanCorpus("en", dir);
    assert.deepEqual(
      files.map((f) => f.name),
      [CONTRACT],
    );
    assert.equal(files[0]!.arc, "Prologue");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("siteModule: снимок валиден как TypeScript-модуль сайта", () => {
  const text = siteModule(
    { lang: "en", done: 1195, plan: 68357, arcsDone: 0, arcsTotal: 19, ratePerMin: 4.4, etaMin: 15000 },
    "2026-11-20T07:20:00.000Z",
  );
  assert.match(text, /export type VoiceProgressData = \{/);
  assert.match(text, /export const VOICE_PROGRESS: VoiceProgressData = \{/);
  assert.match(text, /"done": 1195/);
  assert.match(text, /"updatedAt": "2026-11-20T07:20:00.000Z"/);
});
