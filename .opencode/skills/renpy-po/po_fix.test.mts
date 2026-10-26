/**
 * po_fix.test.mts — юнит-тесты пакетных правок po-записей.
 * node --test .opencode/skills/renpy-po/po_fix.test.mts
 *
 * Файлы po НЕ трогаем: временные копии в tmp/ (poDir — параметр applyFixes).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { applyFixes, parseCli } from "./po_fix.mts";
import { parsePo } from "./po_core.mts";

const SAMPLE = `msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
"Language: it\\n"

msgctxt "ui"
msgid "Hello"
msgstr "Hola"

msgctxt "speaker:Narrator"
msgid "Bye"
msgstr ""

msgctxt "speaker-name"
msgid "Thomas"
msgstr "Tomás"
`;

const withTmpPo = (fn: (dir: string) => void): void => {
  const dir = mkdtempSync(join(tmpdir(), "po_fix_test_"));
  try {
    writeFileSync(join(dir, "it.po"), SAMPLE, "utf-8");
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/** Записи в нумерации po_list/po_fix (без заголовка po-файла). */
const entries = (dir: string): ReturnType<typeof parsePo> =>
  parsePo(readFileSync(join(dir, "it.po"), "utf-8")).filter((e) => e.msgid);

test("clear: msgstr очищается, файл переписывается (round-trip)", () => {
  withTmpPo((dir) => {
    const r = applyFixes("it", [{ lang: "it", idx: 0, op: "clear" }], false, dir);
    assert.equal(r.changed, 1);
    assert.deepEqual(r.skipped, []);
    const e = entries(dir);
    assert.equal(e[0].msgstr, "", "запись 0 должна стать пустой");
    assert.equal(e[2].msgstr, "Tomás", "соседние записи не тронуты");
  });
});

test("set: правка по индексу применяется", () => {
  withTmpPo((dir) => {
    const r = applyFixes("it", [{ lang: "it", idx: 2, op: "set", text: "Thomas" }], false, dir);
    assert.equal(r.changed, 1);
    assert.equal(entries(dir)[2].msgstr, "Thomas");
  });
});

test("пропуски: clear по пустой записи и несуществующий idx", () => {
  withTmpPo((dir) => {
    const r = applyFixes(
      "it",
      [
        { lang: "it", idx: 1, op: "clear" }, // уже пустая
        { lang: "it", idx: 99, op: "clear" }, // нет такой
        { lang: "it", idx: 2, op: "set", text: "Tomás" }, // уже так и есть
      ],
      false,
      dir,
    );
    assert.equal(r.changed, 0);
    assert.deepEqual(r.skipped, [1, 2, 99]);
  });
});

test("dry: операции считаются, файл НЕ меняется", () => {
  withTmpPo((dir) => {
    const before = readFileSync(join(dir, "it.po"), "utf-8");
    const r = applyFixes("it", [{ lang: "it", idx: 0, op: "clear" }], true, dir);
    assert.equal(r.changed, 1);
    assert.equal(readFileSync(join(dir, "it.po"), "utf-8"), before, "dry не пишет файл");
  });
});

test("parseCli: --lang/--clear/--set/--dry", () => {
  const a = parseCli(["--lang", "it", "--clear", "1,2, 3"]);
  assert.equal(a.ops.length, 3);
  assert.deepEqual(a.ops[0], { lang: "it", idx: 1, op: "clear" });
  assert.equal(a.dry, false);
  const b = parseCli(["--lang", "pl", "--set", "42=Текст=с знаком ="]);
  assert.equal(b.ops[0].op, "set");
  assert.equal(b.ops[0].idx, 42);
  assert.equal(b.ops[0].text, "Текст=с знаком =", "первый = разделяет, остальные — часть текста");
  assert.throws(() => parseCli(["--lang", "it", "--set", "без_индекса"]), /ждёт/);
  assert.throws(() => parseCli(["--mystery"]), /неизвестный аргумент/);
  assert.equal(parseCli(["--help"]).help, true);
  assert.equal(parseCli(["--dry"]).dry, true);
});

test("parseCli: --apply читает JSON-массив операций", () => {
  const dir = mkdtempSync(join(tmpdir(), "po_fix_apply_"));
  try {
    const file = join(dir, "fixes.json");
    writeFileSync(
      file,
      JSON.stringify([
        { lang: "it", idx: 0, op: "clear" },
        { lang: "pl", idx: 5, op: "set", text: "OK" },
      ]),
      "utf-8",
    );
    const r = parseCli(["--apply", file]);
    assert.equal(r.ops.length, 2);
    assert.equal(r.ops[1].text, "OK");
    writeFileSync(file, JSON.stringify([{ lang: "it", idx: "nope" }]), "utf-8");
    assert.throws(() => parseCli(["--apply", file]), /невалидная операция/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
