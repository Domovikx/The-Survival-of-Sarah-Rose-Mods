/**
 * Тесты po_update.mts — цикл обновления «вышла новая версия игры».
 *
 * Симуляция: POT v1 из игры → ru.po с переводами → мутация игры (переименование
 * реплики, переезд реплики к другому спикеру, удаление, добавление) → POT v2 →
 * mergePoUpdate. Проверяет: точный перенос, ретаргет-спасение, legacy-keep,
 * новые пустые, детерминизм и идемпотентность.
 * Запуск: node --test .opencode/skills/renpy-po/po_update.test.mts
 */

import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { parsePo, renderPo } from "./po_core.mts";
import { renderPot, scanGame } from "./potgen.mts";
import { mergePoUpdate, poHeaderLines } from "./po_update.mts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
/** Фикстура-симуляция в repo tmp/ (правило: только локальный tmp репозитория). */
const DIR = join(REPO_ROOT, "tmp", "po-update-fixture");

const SCRIPT_V1 = `define s = Character("Sarah")
define k = Character("Kate")

label scene_one:
    s "Hello there!"
    "The wind howls."
    menu:
        "Take the sword":
            s "A fine choice."
    k "Gallery line."
    s "Doomed line."
`;

/** «Новая версия игры»: нарратор переименован, реплика переехала k→s, одна
 * строка удалена, одна добавлена. */
const SCRIPT_V2 = `define s = Character("Sarah")
define k = Character("Kate")

label scene_one:
    s "Hello there!"
    "The wind howls loudly."
    menu:
        "Take the sword":
            s "A fine choice."
    s "Gallery line."
    s "Brand new line."
`;

const HEADER = `# RU test po
msgid ""
msgstr ""
"Project-Id-Version: TSSR-Mods 1.0\\n"
"Language: ru\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Content-Transfer-Encoding: 8bit\\n"`;

const POT_DATE = new Date(0);

function writeGame(script: string): void {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, "script.rpy"), script, "utf-8");
}

function potOf(script: string): string {
  writeGame(script);
  return renderPot(scanGame(DIR), POT_DATE);
}

const TRANSLATIONS: Record<string, string> = {
  "speaker:Sarah\u0000Hello there!": "Привет!",
  "speaker:Narrator\u0000The wind howls.": "Вой ветра.",
  "menu\u0000Take the sword": "Взять меч.",
  "speaker:Kate\u0000Gallery line.": "Строка Кейт.",
  "speaker:Sarah\u0000Doomed line.": "Обречённая строка.",
};

/** ru.po v1: шапка + все записи POT v1, часть заполнена переводами. */
function poFromPot(potText: string): string {
  const entries = parsePo(potText)
    .filter((e) => e.msgid)
    .map((e) => ({ ...e, msgstr: TRANSLATIONS[`${e.msgctxt}\u0000${e.msgid}`] ?? "" }));
  return renderPo(entries, HEADER.split("\n"));
}

test("новая версия: точный перенос, ретаргет-спасение, legacy и новые пустые", () => {
  const po1 = poFromPot(potOf(SCRIPT_V1));
  const pot2 = potOf(SCRIPT_V2);
  const { entries, stats } = mergePoUpdate(po1, pot2);
  const by = new Map(entries.map((e) => [`${e.msgctxt}\u0000${e.msgid}`, e]));

  // Точное совпадение ключа — перевод перенесён.
  assert.equal(by.get("speaker:Sarah\u0000Hello there!")?.msgstr, "Привет!");
  assert.equal(by.get("menu\u0000Take the sword")?.msgstr, "Взять меч.");

  // Реплика переехала Kate → Sarah: перевод спасён ретаргетом.
  assert.equal(by.get("speaker:Sarah\u0000Gallery line.")?.msgstr, "Строка Кейт.");

  // Тексты, выпавшие из POT (переименование + удаление), — legacy с переводом.
  const legacyIds = entries
    .filter((e) => e.flags.includes("legacy"))
    .map((e) => e.msgid)
    .sort();
  assert.deepEqual(legacyIds, ["Doomed line.", "The wind howls."]);
  assert.equal(by.get("speaker:Narrator\u0000The wind howls.")?.msgstr, "Вой ветра.");

  // Новые/переименованные ключи — пустые, ждут переводчика.
  assert.equal(by.get("speaker:Narrator\u0000The wind howls loudly.")?.msgstr, "");
  assert.equal(by.get("speaker:Sarah\u0000Brand new line.")?.msgstr, "");

  assert.equal(stats.retargeted, 1);
  assert.equal(stats.legacyKept, 2);
  assert.equal(stats.carried, 3, "Hello + меню + Gallery (ретаргет)");
  assert.equal(stats.newEntries, 5);
  assert.equal(stats.droppedEmpty, 0);
});

test("исчезнувший непереведённый ключ выкидывается без сожалений", () => {
  const poText = poFromPot(potOf(SCRIPT_V1));
  const entries = parsePo(poText)
    .filter((e) => e.msgid)
    .map((e) => (e.msgid === "Doomed line." ? { ...e, msgstr: "" } : e));
  const po = renderPo(entries, poHeaderLines(poText));
  const pot2 = potOf(SCRIPT_V2);
  const { entries: merged, stats } = mergePoUpdate(po, pot2);
  assert.equal(stats.droppedEmpty, 1);
  assert.equal(stats.legacyKept, 1, "legacy остался только у переведённого «wind howls»");
  assert.ok(!merged.some((e) => e.msgid === "Doomed line."));
});

test("merge детерминирован, round-trip без потерь, uid-комментарии свежие", () => {
  const po1 = poFromPot(potOf(SCRIPT_V1));
  const pot2 = potOf(SCRIPT_V2);
  const a = mergePoUpdate(po1, pot2);
  const b = mergePoUpdate(po1, pot2);
  assert.equal(renderPo(a.entries, a.headerLines), renderPo(b.entries, b.headerLines));

  const reparsed = parsePo(renderPo(a.entries, a.headerLines)).filter((e) => e.msgid);
  assert.equal(reparsed.length, a.entries.length);
  const hello = reparsed.find((e) => e.msgid === "Hello there!");
  assert.ok(
    hello?.comments.some((c) => /^uid: [0-9a-f]{32}$/.test(c)),
    "uid-комментарий обновлён из POT v2",
  );
});

test("повторный запуск по освежённому po — идемпотентен (fixpoint)", () => {
  const po1 = poFromPot(potOf(SCRIPT_V1));
  const pot2 = potOf(SCRIPT_V2);
  const once = mergePoUpdate(po1, pot2);
  const poAfter = renderPo(once.entries, once.headerLines);
  const twice = mergePoUpdate(poAfter, pot2);
  assert.equal(renderPo(twice.entries, twice.headerLines), poAfter, "ничего не изменилось");
  assert.equal(twice.stats.legacyKept, once.stats.legacyKept, "legacy-записи не дублируются");
  assert.equal(twice.stats.retargeted, 0, "ретаргет уже применён");
});
