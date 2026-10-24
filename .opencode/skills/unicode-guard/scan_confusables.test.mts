import { test } from "node:test";
import assert from "node:assert/strict";
import { scanContent, maskEscapes } from "./scan_confusables.mts";

test("maskEscapes: \\n и \\uXXXX маскируются, длина сохраняется", () => {
  assert.equal(maskEscapes("a\\nb").length, 4);
  assert.ok(!/\p{L}/u.test(maskEscapes("\\n")));
  assert.equal(maskEscapes("\\u0445").length, 6);
});

test("чистый русский текст — находок нет", () => {
  const f = scanContent("t.mts", '  who: "Грубый, вульгарный и циничный.",\n');
  assert.equal(f.length, 0);
});

test("чистый латинский текст — находок нет", () => {
  const f = scanContent("t.mts", '  instruct_en: "Male, 25-30 years old, thief",\n');
  assert.equal(f.length, 0);
});

test("escape \\n перед кириллицей — ЛОЖНОЕ срабатывание отсутствует", () => {
  // регрессия: раньше "nХарактер" из "...\\nХарактер" ловился как MIXED_SCRIPT
  const f = scanContent("t.mts", '"сожитель.\\nХарактер: Грубый"');
  assert.equal(f.length, 0);
});

test("CONFUSED: кириллический lookalike внутри латинского слова", () => {
  const f = scanContent("t.mts", '"the quick broвn fox"');
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, "CONFUSED");
});

test("CONFUSED: латинская буква внутри русского слова (слово целиком latin-доминантно не считается)", () => {
  // "привет" с латинской p — кириллица доминирует -> MIXED_SCRIPT, не CONFUSED
  const f = scanContent("t.mts", '"приве́т"'.replace("п", "p"));
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, "MIXED_SCRIPT");
});

test("INVISIBLE: ZWSP и bidi-контрол ловятся", () => {
  assert.equal(scanContent("t.mts", '"a\u200bb"').length, 1);
  assert.equal(scanContent("t.mts", '"a\u202Eb"').length, 1);
});

test("NBSP ловится как warn-находка", () => {
  const f = scanContent("t.mts", '"слово\u00A0другое"');
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, "NBSP");
});

test("TYPO: типографский апостроф в латинском слове", () => {
  const f = scanContent("t.mts", '"don\u2019t do that"');
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, "TYPO");
});

test("ASCII-апостроф в латинском слове — чисто", () => {
  const f = scanContent("t.mts", '"don\'t do that"');
  assert.equal(f.length, 0);
});

test("кириллический апостроф-кавычка «ёлочка» в русском тексте не флагается", () => {
  const f = scanContent("t.mts", '"сказал: «ain\u0027t ya», — и ушёл"');
  assert.equal(f.length, 0);
});

test("находки содержат file/line/detail/excerpt", () => {
  const f = scanContent("x.mts", '"broвn"');
  assert.equal(f[0].file, "x.mts");
  assert.equal(f[0].line, 1);
  assert.ok(f[0].detail.length > 0);
  assert.ok(f[0].excerpt.includes("broвn"));
});
