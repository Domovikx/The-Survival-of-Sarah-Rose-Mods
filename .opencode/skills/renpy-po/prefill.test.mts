/**
 * prefill.test.mts — тесты prefill-миграции tl/ru -> po/ru.po.
 *
 * Контракты: парсинг tl-пар (включая аномалии), точное заполнение по
 * корпусу, конфликт вариантов (пусто + отчёт), normalizeText-твин с
 * блоклистом, святость human-msgstr (verbatim без auto-normalized),
 * пересчёт авто-флага, сироты, счётчик new==old.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeText, renderPo } from "./po_core.mts";
import type { PoEntry } from "./po_core.mts";
import { addPairs, loadBlocklist, parseTlPairs, prefillRu } from "./prefill.mts";
import type { RuMap } from "./prefill.mts";

/** Минимальный POT из пар [msgctxt, msgid]. */
function potText(entries: Array<[string, string]>): string {
  const es: PoEntry[] = entries.map(([msgctxt, msgid]) => ({
    msgid,
    msgctxt,
    msgstr: "",
    refs: [],
    comments: [],
    flags: [],
    translator: [],
  }));
  return renderPo(es, ['msgid ""', 'msgstr ""']);
}

/** ru.po из записей (для human-состояния). */
function ruText(entries: Array<{ msgctxt: string; msgid: string; msgstr: string; flags?: string[] }>): string {
  const es: PoEntry[] = entries.map((e) => ({
    msgid: e.msgid,
    msgctxt: e.msgctxt,
    msgstr: e.msgstr,
    refs: [],
    comments: [],
    flags: e.flags ?? [],
    translator: [],
  }));
  return renderPo(es, ['msgid ""', 'msgstr ""']);
}

function mapFromPairs(pairs: Array<{ old: string; new: string }>): RuMap {
  const m: RuMap = new Map();
  addPairs(m, pairs, "fixture.rpy");
  return m;
}

test("parseTlPairs: строки-блок, экранирование, аномалии", () => {
  const src = [
    "# -*- encoding: utf-8 -*-",
    "translate ru strings:",
    "",
    '    old "Hello \\"world\\"."',
    '    new "Привет \\"мир\\"."',
    "",
    '    old "Line\\nbreak"',
    '    new "Строка\\nперевод"',
    "",
    '    old "Dangling old"',
    "translate ru strings:",
    '    new "без old"',
    "",
  ].join("\n");
  const { pairs, anomalies } = parseTlPairs(src);
  assert.equal(pairs.length, 2);
  assert.deepEqual(pairs[0], { old: 'Hello "world".', new: 'Привет "мир".' });
  assert.deepEqual(pairs[1], { old: "Line\nbreak", new: "Строка\nперевод" });
  // dangling old (обрыв кодом) + new без old = 2
  assert.equal(anomalies, 2);
});

test("addPairs: пустой new пропускается, файлы не дублируются", () => {
  const m: RuMap = new Map();
  const skipped = addPairs(
    m,
    [
      { old: "A", new: "" },
      { old: "B", new: "Б" },
      { old: "B", new: "Б" },
      { old: "B", new: "Бы" },
    ],
    "f.rpy",
  );
  assert.equal(skipped, 1);
  assert.equal(m.size, 1);
  assert.deepEqual([...m.get("B")!.keys()], ["Б", "Бы"]);
  assert.deepEqual(m.get("B")!.get("Б"), ["f.rpy"]);
});

test("prefill: точное совпадение покрывает все контексты одного текста", () => {
  const pot = potText([
    ["speaker:Narrator", "The door opens."],
    ["speaker:Sarah", "The door opens."],
  ]);
  const ruMap = mapFromPairs([{ old: "The door opens.", new: "Дверь открывается." }]);
  const { entries, stats } = prefillRu({ potText: pot, ruMap });
  assert.equal(stats.total, 2);
  assert.equal(stats.exact, 2);
  assert.equal(stats.missing, 0);
  for (const e of entries) assert.equal(e.msgstr, "Дверь открывается.");
});

test("prefill: разные RU на один EN = конфликт, запись пустая, отчёт", () => {
  const pot = potText([["speaker:A", "Hi."]]);
  const m: RuMap = new Map();
  addPairs(m, [{ old: "Hi.", new: "Привет." }], "a.rpy");
  addPairs(m, [{ old: "Hi.", new: "Здравствуй." }], "b.rpy");
  const { entries, stats, details } = prefillRu({ potText: pot, ruMap: m });
  assert.equal(entries[0].msgstr, "");
  assert.equal(stats.conflicts, 1);
  assert.equal(stats.conflictKeys, 1);
  assert.deepEqual(details.conflicts[0].variants, ["Здравствуй.", "Привет."]);
});

test("prefill: normalizeText-твин наследует единственный перевод", () => {
  const pot = potText([["speaker:A", "Yeees yeees, I'll be thereee!"]]);
  const ruMap = mapFromPairs([{ old: "004 Yeees yeees Ill be thereee 1", new: "Да да да, я там буду." }]);
  const { entries, stats } = prefillRu({ potText: pot, ruMap });
  assert.equal(entries[0].msgstr, "Да да да, я там буду.");
  assert.deepEqual(entries[0].flags, ["fuzzy", "auto-normalized"]);
  assert.equal(stats.autoNormalized, 1);
});

test("prefill: блоклист запрещает автозаполнение по нормали", () => {
  const msgid = "Yeees yeees, I'll be thereee!";
  const pot = potText([["speaker:A", msgid]]);
  const ruMap = mapFromPairs([{ old: "004 Yeees yeees Ill be thereee 1", new: "Да." }]);
  const blocked = new Set([normalizeText(msgid)]);
  const { entries, stats } = prefillRu({ potText: pot, ruMap, blocked });
  assert.equal(entries[0].msgstr, "");
  assert.equal(stats.missing, 1);
  // блоклист парсится из текста со строками-комментариями
  const bl = loadBlocklist("# коммент\n  yes yes ill be there  # коммент-хвост\n\n");
  assert.deepEqual([...bl], ["yes yes ill be there"]);
});

test("prefill: human-msgstr без auto-normalized сохраняется верbatim", () => {
  const pot = potText([["speaker:A", "Hello"]]);
  const ruMap = mapFromPairs([{ old: "Hello", new: "Здравствуй (из корпуса)." }]);
  const oldRu = ruText([{ msgctxt: "speaker:A", msgid: "Hello", msgstr: "Привет (ручной)." }]);
  const { entries, stats } = prefillRu({ potText: pot, ruMap, oldRuText: oldRu });
  assert.equal(entries[0].msgstr, "Привет (ручной).");
  assert.equal(stats.humanKept, 1);
  assert.equal(stats.exact, 0);
});

test("prefill: прошлый авто-флаг пересчитывается от корпуса", () => {
  const pot = potText([["speaker:A", "Hello"]]);
  const ruMap = mapFromPairs([{ old: "Hello", new: "Здравствуй (корпус v2)." }]);
  const oldRu = ruText([
    {
      msgctxt: "speaker:A",
      msgid: "Hello",
      msgstr: "Старый авто-вариант.",
      flags: ["fuzzy", "auto-normalized"],
    },
  ]);
  const { entries, stats } = prefillRu({ potText: pot, ruMap, oldRuText: oldRu });
  assert.equal(entries[0].msgstr, "Здравствуй (корпус v2).");
  assert.deepEqual(entries[0].flags, []);
  assert.equal(stats.exact, 1);
  assert.equal(stats.humanKept, 0);
});

test("prefill: сироты (RU без POT-записи) и new==old", () => {
  const pot = potText([["speaker:A", "In POT."]]);
  const ruMap = mapFromPairs([
    { old: "In POT.", new: "In POT." }, // пасsthrough
    { old: "Выпавшая строка.", new: "Перевод без записи." },
  ]);
  const { stats, details } = prefillRu({ potText: pot, ruMap });
  assert.equal(stats.exact, 1);
  assert.equal(stats.sameAsSource, 1);
  assert.equal(stats.orphans, 1);
  assert.equal(details.orphans[0].text, "Выпавшая строка.");
});

test("prefill: идемпотентность — повторный прогон ничего не меняет", () => {
  const pot = potText([
    ["speaker:A", "One"],
    ["speaker:B", "Two"],
  ]);
  const ruMap = mapFromPairs([
    { old: "One", new: "Раз." },
    { old: "Two", new: "Два." },
  ]);
  const first = prefillRu({ potText: pot, ruMap });
  const firstRu = ruText(
    first.entries.map((e) => ({ msgctxt: e.msgctxt, msgid: e.msgid, msgstr: e.msgstr, flags: e.flags })),
  );
  const second = prefillRu({ potText: pot, ruMap, oldRuText: firstRu });
  assert.equal(second.stats.humanKept, 2);
  assert.equal(second.stats.exact, 0);
  assert.deepEqual(
    second.entries.map((e) => e.msgstr),
    first.entries.map((e) => e.msgstr),
  );
});
