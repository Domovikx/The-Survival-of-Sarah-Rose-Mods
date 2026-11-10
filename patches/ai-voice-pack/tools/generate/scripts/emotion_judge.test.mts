/**
 * emotion_judge.test.mts — чистые функции судьи тона.
 * node --test patches/ai-voice-pack/tools/generate/scripts/emotion_judge.test.mts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { isDemoTone, JUDGE_SYSTEM, parseToneVerdict, toneJudgeUser } from "./emotion_judge.mts";

test("isDemoTone: арка Prologue и демо-сцены входят", () => {
  assert.equal(isDemoTone({ arc: "Prologue", scene: "OpeningScene" }), true);
  assert.equal(isDemoTone({ arc: "StoryBeginnings", scene: "ChooseThePath" }), true);
  assert.equal(isDemoTone({ arc: "StoryBeginnings", scene: "TheMorningAfterKate" }), true);
  assert.equal(isDemoTone({ arc: "Other", scene: "start" }), true);
});

test("isDemoTone: после первого выбора и прочие арки — не демо", () => {
  assert.equal(isDemoTone({ arc: "StoryBeginnings", scene: "TheInsidePathBegins" }), false);
  assert.equal(isDemoTone({ arc: "WarArc", scene: "WarCouncil" }), false);
  assert.equal(isDemoTone({ arc: "Other", scene: null }), false);
});

test("parseToneVerdict: балл и issues из JSON судьи", () => {
  const v = parseToneVerdict('{"score": 9, "issues": []}');
  assert.equal(v.score, 9);
  assert.deepEqual(v.issues, []);
  const bad = parseToneVerdict('{"score":"4","issues":["Wrong language","Off-key moment"]}');
  assert.equal(bad.score, 4);
  assert.deepEqual(bad.issues, ["Wrong language", "Off-key moment"]);
});

test("parseToneVerdict: мусор на входе даёт -1", () => {
  assert.equal(parseToneVerdict("не JSON").score, -1);
});

test("JUDGE_SYSTEM: спек разрешает эмоции и тоны нарратора (FP-классы волны 1)", () => {
  // эмоциональные слова допустимы — судья не должен их валить как «не delivery state»
  assert.match(JUDGE_SYSTEM, /EMOTION WORDS ARE ACCEPTABLE/);
  // нарратор — озвученный диктор, у него есть стили доставки
  assert.match(JUDGE_SYSTEM, /Narrator is a VOICED storyteller/);
  // не требуем объём/темп/фонетику — их нет в спеке
  assert.match(JUDGE_SYSTEM, /do NOT require volume, pacing/);
});

test("toneJudgeUser: перевод строки помечен как контекст, не инструкция", () => {
  const e = {
    uid: "u",
    old: "She sighed.",
    new: "Она вздохнула.",
    who_name: "Narrator",
    arc: "Prologue",
    scene: "S1",
    category: "narration",
  };
  const u = toneJudgeUser(e, "Weary and resigned");
  assert.match(u, /Context translation \(reference only/);
  assert.match(u, /TON: Weary and resigned/);
});
