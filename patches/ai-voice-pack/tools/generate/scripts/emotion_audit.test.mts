/**
 * Тесты emotion_audit.mts: детекторы нарушений правил тона + однородность.
 * Правила качества — .opencode/skills/emotion-tag/SKILL.md.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { auditEmotions, formatReport, violationsOf, type EmotionRow } from "./emotion_audit.mts";

const row = (emo: string | null, sample = "A line."): EmotionRow => ({ emo, sample, category: "narration" });

test("violationsOf: валидный тон проходит без замечаний", () => {
  for (const ok of [
    "In a low menacing whisper",
    "Curiously observing",
    "Warmly, with affection",
    "Evenly, with a measured neutral tone",
  ]) {
    assert.deepEqual(violationsOf(ok), [], `должен пройти: ${ok}`);
  }
});

test("violationsOf: нарушения правил ловятся поимённо", () => {
  // кириллица (инцидент: «Sarа» с кириллической «а» в тоне)
  assert.ok(violationsOf("Sarа rolled her eyes with a mocking smirk").includes("кириллица в тоне"));
  // пусто / null / none — на каждой озвучиваемой записи тон ОБЯЗАН стоять
  assert.ok(violationsOf(null).includes("пустой тон"));
  assert.ok(violationsOf("  ").includes("пустой тон"));
  assert.ok(violationsOf("none").includes('"none"'));
  // длина: 2-6 слов
  assert.ok(
    violationsOf("In a serene and peaceful tone. With a soft and gentle warmth. Quietly admiring").includes(
      "больше 6 слов",
    ),
  );
  assert.ok(violationsOf("Intrigued").includes("1 слово (нет инструкции)"));
  // форма
  assert.ok(violationsOf("softly, with warmth").includes("не с заглавной буквы"));
  assert.ok(violationsOf('"Curiously observing"').includes("в кавычках"));
});

test("violationsOf: CJK и смешанные нарушения суммируются", () => {
  const v = violationsOf("тихо, по-японски そっと");
  assert.ok(v.includes("кириллица в тоне"), "кириллица должна пойматься");
  assert.ok(v.includes("CJK в тоне"), "CJK должен пойматься");
  // длина здесь В норме (3 слова) — нарушения суммируются, но лишнего нет
  assert.ok(!v.includes("больше 6 слов"));
});

test("auditEmotions: однородность — топ, доли, мусорный хвост", () => {
  const rows = [
    row("Curiously observing"),
    row("Curiously observing"),
    row("Curiously observing"),
    row("Warmly, with affection"),
    row("Only once"),
  ];
  const r = auditEmotions(rows);
  assert.equal(r.total, 5);
  assert.equal(r.unique, 3);
  assert.equal(r.top[0][0], "Curiously observing");
  assert.equal(r.top[0][1], 3);
  assert.equal(r.topShare, 60, "доля топ-1 считается от всех строк");
  assert.equal(r.singletons, 2, "«Warmly» и «Only once» — по одному разу");
});

test("auditEmotions: пустые тоны попадают в нарушения и НЕ в словарь", () => {
  const r = auditEmotions([row(null), row("Calmly confident"), row("")]);
  assert.equal(r.violations["пустой тон"].length, 2);
  assert.equal(r.unique, 1, "пустые не образуют тонов");
  assert.equal(r.topShare, (100 * 1) / 3, "доля считается от ВСЕХ строк, включая пустые");
});

test("formatReport: отчёт содержит нарушения и однородность", () => {
  const r = auditEmotions([row("Curiously observing"), row("none")]);
  const text = formatReport(r, "тест").join("\n");
  assert.match(text, /нарушения правил/);
  assert.match(text, /однородность/);
  assert.match(text, /"none"/);
  assert.match(text, /топ-1 «Curiously observing»: 1 \(50\.0%\)/);
});
