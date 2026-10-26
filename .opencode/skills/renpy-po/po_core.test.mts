/**
 * Тесты po_core.mts — экранирование, парс/рендер PO, normalizeText.
 * Запуск: node --test .opencode/skills/renpy-po/po_core.test.mts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeText, parsePo, poEscape, poUnescape, renderPo, writePoAtomic } from "./po_core.mts";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("escape/unescape — обратимость для спецсимволов", () => {
  const samples = ['He said "Hi".', "back\\slash", "line\nbreak", "tab\there", "plain"];
  for (const s of samples) assert.equal(poUnescape(poEscape(s)), s);
});

test("parsePo: заголовок, флаги, комментарии, многострочные продолжения", () => {
  const text = [
    'msgid ""',
    'msgstr ""',
    '"Project-Id-Version: x\\n"',
    "",
    "#. rich_text: <i>hint</i>",
    "#, fuzzy",
    "# translator note",
    'msgctxt "speaker:Kate"',
    'msgid "Multi"',
    '" line"',
    'msgstr "Много\\n"',
    '"строк"',
    "",
  ].join("\n");
  const [header, entry] = parsePo(text);
  assert.equal(header.msgid, "");
  assert.equal(entry.msgctxt, "speaker:Kate");
  assert.equal(entry.msgid, "Multi line");
  assert.equal(entry.msgstr, "Много\nстрок");
  assert.deepEqual(entry.flags, ["fuzzy"]);
  assert.deepEqual(entry.comments, ["rich_text: <i>hint</i>"]);
  assert.deepEqual(entry.translator, ["translator note"]);
});

test("renderPo -> parsePo round-trip сохраняет записи", () => {
  const entries = [
    {
      msgid: 'Quotes "и" back\\slash',
      msgctxt: "speaker:Sarah",
      msgstr: "Перевод со\nпереносом",
      refs: ["script.rpy [spk:Cartel Guy]"],
      comments: ["note: x"],
      flags: ["fuzzy"],
      translator: [],
    },
  ];
  const parsed = parsePo(renderPo(entries, ['msgid ""', 'msgstr ""'])).filter((e) => e.msgid);
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0], entries[0]);
});

test("normalizeText: растяжение/апострофы/цифры выкидываются, слова остаются", () => {
  // Кейсы из NeonTranslator (оригинальный контракт нормали).
  assert.equal(normalizeText("004 Yeees yeees Ill be thereee 1"), "yes yes ill be there");
  assert.equal(normalizeText("Yeees yeees, I'll be thereee!"), "yes yes ill be there");
  assert.equal(normalizeText("Really?"), "really");
  assert.equal(normalizeText(""), "");
});

test("normalizeText различает разные слова", () => {
  assert.notEqual(normalizeText("Go left"), normalizeText("Go right"));
});

test("writePoAtomic: целевой файл всегда целый, .part не остаётся (инцидент 2026-10-26)", () => {
  // Перезапуск сервера убил переводчик посреди writeFileSync -> de.po стал
  // 7.5 МБ нулей. Атомарная запись гарантирует «старая версия ИЛИ новая».
  const dir = mkdtempSync(join(tmpdir(), "po-atomic-"));
  try {
    const p = join(dir, "x.po");
    const v1 = 'msgid "a"\nmsgstr "б"\n';
    writePoAtomic(p, v1);
    assert.equal(readFileSync(p, "utf-8"), v1);
    assert.ok(!existsSync(`${p}.part`), "временный .part обязан быть переименован");

    const v2 = 'msgid "a"\nmsgstr "вторая версия"\n';
    writePoAtomic(p, v2);
    assert.equal(readFileSync(p, "utf-8"), v2, "перезапись идёт поверх, без дублей");
    assert.ok(!existsSync(`${p}.part`));
    // файл никогда не пустой и не нулевой после успешной записи
    assert.ok(readFileSync(p).length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
