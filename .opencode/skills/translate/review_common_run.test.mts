/**
 * review_common_run.test.mts — тесты общего кода гейта вклеек.
 * node --test .opencode/skills/translate/review_common_run.test.mts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { commonRun, contentWords } from "./review_common_run.mts";

test("commonRun: длинная вклейка соседа находится", () => {
  const run = commonRun(
    "С нарастающим голодом они оба принялись за еду, обмениваясь историями о своей жизни до того, как познакомились.",
    "Пока они ели свою порцию, каждый из них делился историями о своей жизни до того, как они познакомились.",
  );
  assert.equal(run, "историями о своей жизни до того как");
});

test("commonRun: короткий естественный эхо-параллелизм не выдаётся длиннее, чем есть", () => {
  const run = commonRun("Она проснулась рано утром.", "Она проснулась рано утром и пошла гулять.");
  assert.ok(run.length === 0 || run.split(" ").length >= 3);
});

test("commonRun: без общего фрагмента — пусто", () => {
  assert.equal(commonRun("Марион покачал головой.", "Варга пристально посмотрел на неё."), "");
});

test("contentWords: служебные слова не считаются содержательными", () => {
  assert.equal(contentWords("с тех пор как"), 0);
  assert.equal(contentWords("пара маленьких очков"), 3);
  assert.equal(contentWords("историями о своей жизни до того как"), 2);
});
