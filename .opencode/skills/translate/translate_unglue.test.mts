/**
 * translate_unglue.test.mts — разклейка po без модели (только текст).
 *
 * Фиксируем то, что уже ломало корпус (2026-11-18):
 *   1) взаимный дубль (две строки с одним переводом) — обнуляются ОБЕ, иначе
 *      гейт салважа «видит соседа» и запирает починку навсегда;
 *   2) вклейка (строка = перевод соседа + хвост) — обнуляется только она;
 *      для ОДИНАКОВЫХ текстов обнуляются оба (не разорвать круг иначе);
 *   3) законное совпадение (одинаковые оригиналы) — не трогается;
 *   4) нормальные строки не задеваются.
 *
 * Запуск: node --test .opencode/skills/translate/translate_unglue.test.mts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { parsePo, renderPo } from "../renpy-po/po_core.mts";

const DIR = join("tmp", "e2e-unglue");
const FILE = join(DIR, "xx.po");
const SCRIPT = resolve(".opencode/skills/translate/translate_unglue.mts");

const entry = (en: string, fr: string) => ({
  msgctxt: "speaker:Narrator",
  msgid: en,
  msgstr: fr,
  comments: [],
  refs: [],
  flags: [],
  translator: [],
});

test("E2E: разклейка обнуляет дубли и не трогает законные повторы", () => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  writeFileSync(
    FILE,
    renderPo(
      [
        // 1) взаимный дубль: два РАЗНЫХ оригинала с одинаковым переводом
        entry("Mutual A.", "Doublon mutuel."),
        entry("Mutual B.", "Doublon mutuel."),
        // 2) вклейка: вторая строка = перевод первой + лишний хвост
        entry("Owner line.", "Ligne propriétaire."),
        entry("Thief line.", "Ligne propriétaire. Et quelque chose de plus ici."),
        // 3) законное совпадение: оригиналы почти одинаковые (общий префикс)
        entry("Legit shared prefix line.", "Ligne légitime."),
        entry("Legit shared prefix line continues.", "Ligne légitime."),
        // 4) нормальные строки
        entry("Fine one.", "Bien une."),
        entry("Fine two.", "Bien deux."),
      ],
      ['msgid ""', 'msgstr ""', '"Content-Type: text/plain; charset=UTF-8\\n"'],
    ),
    "utf-8",
  );

  const env = { ...process.env, TSSR_SALVAGE_PO: FILE };
  execFileSync(process.execPath, ["--experimental-strip-types", SCRIPT, "xx", "--apply"], { env, encoding: "utf-8" });

  const rows = parsePo(readFileSync(FILE, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);
  const get = (en: string) => rows.find((e) => e.msgid === en)?.msgstr ?? "<нет строки>";

  // 1) взаимный дубль — обнулены оба (иначе починка запирается)
  assert.equal(get("Mutual A."), "");
  assert.equal(get("Mutual B."), "");

  // 2) вклейка — обнулён только «контейнер» (он содержит чужой текст целиком)
  assert.equal(get("Thief line."), "");
  assert.equal(get("Owner line."), "Ligne propriétaire.");

  // 3) законное совпадение не тронуто (sharePhrase исключает такие пары)
  assert.equal(get("Legit shared prefix line."), "Ligne légitime.");
  assert.equal(get("Legit shared prefix line continues."), "Ligne légitime.");

  // 4) нормальные строки не пострадали
  assert.equal(get("Fine one."), "Bien une.");
  assert.equal(get("Fine two."), "Bien deux.");

  rmSync(DIR, { recursive: true, force: true });
});
