/**
 * judge_client.test.mts — тесты клиента судьи: charsOf/алиасы и промпт-варианты.
 * node --test .opencode/skills/translate/judge_client.test.mts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { charsOf, judgeSystem } from "./judge_client.mts";

const NAME_CANON = new Map([
  ["Xanthippe", "Ксантиппа"],
  ["Sarah", "Сара"],
]);

test("charsOf: пол спикера и упомянутых имён", () => {
  const s = charsOf("speaker:Sarah", "Sarah met Xanthippe today.", NAME_CANON);
  assert.match(s, /speaker Sarah=female/);
  assert.match(s, /Сара=female/);
  assert.match(s, /Ксантиппа=male/);
});

test("charsOf: алиас Xan → Xanthippe с полом (male)", () => {
  const s = charsOf("speaker:Narrator", "Xan laughed.", NAME_CANON);
  assert.match(s, /Xan=male/);
  assert.match(s, /тот же человек/);
});

test("charsOf: без известных имён — пусто", () => {
  assert.equal(charsOf("speaker:Narrator", "It was a dark night.", NAME_CANON), "");
});

test("judgeSystem: целевой язык и rubric-измерения в v10", () => {
  const s = judgeSystem("German", "v10");
  assert.match(s, /German TRANSLATION/);
  assert.match(s, /content:/);
  assert.match(s, /grammar:/);
  assert.match(s, /gender:/);
  assert.match(s, /"content":"ok\|bad"/);
});

test("judgeSystem: неизвестный вариант падает на базовый", () => {
  assert.equal(judgeSystem("Russian", "nonsense"), judgeSystem("Russian", "base"));
});
