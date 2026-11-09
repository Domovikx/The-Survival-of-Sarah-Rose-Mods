/**
 * po2tl.test.mts — тесты конвертера po → tl/*.rpy.
 * node --test .opencode/skills/renpy-po/po2tl.test.mts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { parsePo } from "./po_core.mts";
import { PotIndex } from "./pot_resolve.mts";
import { buildTlFiles } from "./po2tl.mts";

const POT = `msgid ""
msgstr ""
"Project-Id-Version: t\\n"

#. arc: Prologue
#. scene: OpeningScene
msgctxt "speaker:Narrator"
msgid "Hello \\"world\\""
msgstr ""

#. arc: Prologue
#. scene: OpeningScene
msgctxt "menu"
msgid "Start"
msgstr ""

#. arc: Prologue
#. scene: OpeningScene
msgctxt "speaker:Sarah"
msgid "Line one\\nline two"
msgstr ""

#. arc: Other
#. scene: start
msgctxt "ui"
msgid "Load"
msgstr ""

#. arc: Other
#. scene: start
msgctxt "speaker-name"
msgid "Sarah"
msgstr ""

#. arc: Other
#. scene: missing
msgctxt "speaker:Narrator"
msgid "Drift line"
msgstr ""
`;

const PO = `msgid ""
msgstr ""
"Project-Id-Version: t\\n"

msgctxt "speaker:Narrator"
msgid "Hello \\"world\\""
msgstr "Привет \\"мир\\""

msgctxt "menu"
msgid "Start"
msgstr "Начать"

msgctxt "speaker:Sarah"
msgid "Line one\\nline two"
msgstr "Строка один\\nстрока два"

msgctxt "ui"
msgid "Load"
msgstr "Загрузка"

msgctxt "speaker-name"
msgid "Sarah"
msgstr "Сара"

msgctxt "speaker:Narrator"
msgid "Drift line"
msgstr ""
`;

const entries = parsePo(PO).filter((e) => e.msgid);
const pot = new PotIndex(POT);
const files = buildTlFiles(entries, "ru", (c, m) => pot.resolve(c, m));
const byRel = new Map(files.map((f) => [f.rel, f.body]));

test("группировка: речь и меню — в файл сцены", () => {
  const body = byRel.get("Prologue/OpeningScene.rpy");
  assert.ok(body, "файл сцены существует");
  assert.match(body, /# Arc: Prologue \| Scene: OpeningScene/);
  assert.match(body, /translate ru strings:/);
  assert.match(body, /old "Hello \\"world\\""\n\s+new "Привет \\"мир\\""/);
  assert.match(body, /old "Start"\n\s+new "Начать"/);
});

test("многострочный перевод: \\n сохраняется в литерале rpy", () => {
  const body = byRel.get("Prologue/OpeningScene.rpy") ?? "";
  assert.match(body, /old "Line one\\nline two"/);
  assert.match(body, /new "Строка один\\nстрока два"/);
});

test("ui → screens.rpy, speaker-name → misc_strings.rpy", () => {
  const screens = byRel.get("screens.rpy");
  assert.ok(screens && /# UI Strings/.test(screens));
  assert.match(screens, /old "Load"\n\s+new "Загрузка"/);
  const misc = byRel.get("misc_strings.rpy");
  assert.ok(misc && /# Character names/.test(misc));
  assert.match(misc, /old "Sarah"\n\s+new "Сара"/);
});

test("пустой msgstr не попадает в tl (дрейф POT → misc не пишется)", () => {
  for (const f of files) assert.ok(!f.body.includes("Drift line"), `не должно быть: ${f.rel}`);
  assert.equal(
    files.some((f) => f.rel.includes("_unknown")),
    false,
  );
});

test("детерминизм: повторный сбор даёт тот же набор и порядок", () => {
  const again = buildTlFiles(entries, "ru", (c, m) => pot.resolve(c, m));
  assert.deepEqual(
    again.map((f) => f.rel),
    files.map((f) => f.rel),
  );
  assert.deepEqual(
    again.map((f) => f.body),
    files.map((f) => f.body),
  );
});
