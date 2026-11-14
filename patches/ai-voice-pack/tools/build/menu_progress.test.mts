/**
 * menu_progress.test.mts — страж честного статуса «демо или полный» в меню.
 *
 * ЗАЧЕМ (запрос владельца, 2026-11-14): игрок должен видеть ДО покупки/игры,
 * что перевод и озвучка выбранного языка неполные — «страховка от хэйта».
 * Поэтому в меню выводятся две строки по ВЫБРАННОМУ языку:
 *   1) текст: «полный» или «демо — N% (переведено из всего)»;
 *   2) озвучка: «полная» или «демо — N из M реплик».
 *
 * Цифры считает СБОРКА (catalog_gen.mts -> catalog/progress.json): рантайму
 * нельзя читать po/ и обходить тысячи файлов ради двух чисел. Тест держит
 * контракт в трёх местах:
 *   • генератор пишет progress.json и считает языки из КАНОНА порядка;
 *   • игра читает файл через renpy.file и не падает, если его нет;
 *   • строки статуса переведены на все языки (иначе игрок увидит английский).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = resolve(ROOT, "..", "..");
const UI = join(ROOT, "zzz_ui.rpy");
const GEN = join(ROOT, "tools", "generate", "scripts", "catalog_gen.mts");

const CANON = JSON.parse(readFileSync(join(REPO, "config", "language-priority.json"), "utf-8")) as {
  languages: { code: string }[];
};
const LANGS = CANON.languages.map((l) => l.code).filter((c) => c !== "en");

const ui = (): string => readFileSync(UI, "utf-8");
const gen = (): string => readFileSync(GEN, "utf-8");

test("генератор пишет progress.json и берёт языки из канона порядка", () => {
  const g = gen();
  assert.match(g, /progress\.json/, "генератор должен писать progress.json");
  assert.match(g, /language-priority\.json/, "порядок языков — из config/language-priority.json, а не списком");
  assert.match(g, /buildProgress/, "нет функции buildProgress");
  // счёт перевода = непустые msgstr; счёт озвучки = файлы .opus/.wav
  assert.match(g, /msgstr/, "перевод должен считаться по msgstr");
  assert.match(g, /\.opus/);
  assert.match(g, /\.wav/);
});

test("игра читает progress.json безопасно (нет файла — не падаем)", () => {
  const s = ui();
  const fn = /def tssr_progress\(\):([\s\S]*?)\n {4}def /.exec(s);
  assert.ok(fn, "нет функции tssr_progress");
  assert.match(fn[1], /renpy\.file\("catalog\/progress\.json"\)/);
  assert.match(fn[1], /except Exception/, "чтение обязано быть в try/except");
  assert.match(fn[1], /TSSR_PROGRESS\.update/, "результат должен кешироваться");
});

test("статус считается по ВЫБРАННОМУ языку, текст и озвучка отдельно", () => {
  const s = ui();
  const fn = /def tssr_progress_lines\(code\):([\s\S]*?)\n {4}def /.exec(s);
  assert.ok(fn, "нет функции tssr_progress_lines");
  assert.match(fn[1], /translated/, "текст берётся из translated");
  assert.match(fn[1], /Text: full \(\{n\} of \{total\} lines\)/);
  assert.match(fn[1], /Text: demo/);
  assert.match(fn[1], /Voice: full \(\{n\} of \{total\} lines\)/);
  assert.match(fn[1], /Voice: demo/);
  // разделитель разрядов: 69 120 читаемо, 69120 — нет
  assert.match(s, /\{:,""\}|replace\(",", " "\)|replace\(", "\)/, "числа должны печататься с разделителем разрядов");
});

test("«демо» = неполный текст ИЛИ неполная озвучка", () => {
  const fn = /def tssr_is_demo\(code=None\):([\s\S]*?)\n {4}def /.exec(ui());
  assert.ok(fn, "нет функции tssr_is_demo");
  assert.match(fn[1], /_tr >= _total and _vo >= _total/, "демо при неполном тексте или озвучке");
});

test("строки статуса переведены на все языки", () => {
  const s = ui();
  for (const key of [
    "Text: full ({n} of {total} lines)",
    "Text: demo - {p}% ({n} of {total} lines)",
    "Voice: full ({n} of {total} lines)",
    "Voice: demo - {n} of {total} lines",
  ]) {
    const pairs = [
      ...s.matchAll(new RegExp(`old "${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*\\n\\s*new "([^"]*)"`, "g")),
    ].length;
    assert.equal(pairs, LANGS.length, `«${key}»: переводов ${pairs}, ожидалось ${LANGS.length}`);
  }
});
