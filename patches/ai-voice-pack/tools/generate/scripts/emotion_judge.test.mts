/**
 * Тесты emotion_judge.mts: разбор вердикта и сборка промпта судьи тона.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseToneVerdict, toneJudgeUser } from "./emotion_judge.mts";
import type { CatalogEntry } from "./voice_batch.mts";

const mk = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  uid: "u",
  old: "I will never be free from the chains.",
  new: "Я никогда не буду свободна от цепей.",
  who: null,
  who_name: "Sarah",
  arc: "WarriorPath",
  scene: "WarriorRahayal3",
  category: "dialogue",
  emotion: "Curiously observing",
  ...over,
});

test("parseToneVerdict: score и issues из сырого JSON", () => {
  assert.deepEqual(parseToneVerdict('{"score":9,"issues":[]}'), { score: 9, issues: [] });
  assert.deepEqual(parseToneVerdict('{"score": "7", "issues": ["Off-key for the moment"]}'), {
    score: 7,
    issues: ["Off-key for the moment"],
  });
  // битый ответ -> score -1 (строка уходит в отчёт, не в принятые)
  assert.equal(parseToneVerdict("мусор без json").score, -1);
  assert.deepEqual(parseToneVerdict('{"score":10}').issues, []);
});

test("toneJudgeUser: контекст строки + сам тон", () => {
  const u = toneJudgeUser(mk(), "Resigned and defiant", "He rode her hard again.", "That was fine with her.");
  assert.match(u, /Speaker: Sarah \| arc: WarriorPath \| scene: WarriorRahayal3/);
  assert.match(u, /SOURCE \(EN\): I will never be free/);
  assert.match(u, /RU translation: Я никогда не буду свободна/);
  assert.match(u, /Previous line: He rode her hard again\./);
  assert.match(u, /Next line: That was fine with her\./);
  assert.ok(u.endsWith("TON: Resigned and defiant"), "тон — последним, ближе всего к вердикту");
});

test("toneJudgeUser: Narrator и отсутствующие соседи/сцена не ломают промпт", () => {
  const u = toneJudgeUser(mk({ who_name: null, scene: null, new: "" }), "Wistful memory");
  assert.match(u, /Speaker: Narrator \| arc: WarriorPath$/m);
  assert.ok(!u.includes("scene:"), "пустая сцена не подставляется");
  assert.ok(!u.includes("RU translation"), "нет перевода — нет строки");
  assert.ok(!u.includes("Previous line") && !u.includes("Next line"));
});
