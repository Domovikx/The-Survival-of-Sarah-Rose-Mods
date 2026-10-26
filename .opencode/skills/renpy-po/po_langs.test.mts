import assert from "node:assert";
import { test } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { LANGS, langProfile } from "./po_langs.mts";
import { COMMON, EROTIC_NOTE, type LangProfile } from "./po_langs/common.mts";

const DIR = join(import.meta.dirname, "po_langs");
const FILES = readdirSync(DIR)
  .filter((f) => f.endsWith(".mts"))
  .toSorted();

test("атомизация: на каждый язык свой файл, общий index и re-export", () => {
  const expected = [
    "common.mts",
    "index.mts",
    "de.mts",
    "es.mts",
    "fr.mts",
    "it.mts",
    "ja.mts",
    "ko.mts",
    "pl.mts",
    "pt.mts",
    "ru.mts",
    "zh.mts",
  ];
  assert.deepEqual(FILES, expected.toSorted());
  // точка входа осталась на месте — импортёры po_translate не тронуты
  const entry = readFileSync(join(import.meta.dirname, "po_langs.mts"), "utf-8");
  assert.match(entry, /from "\.\/po_langs\/index\.mts"/);
});

test("профили самодостаточны: каждый файл экспортирует profile с полным контрактом", () => {
  for (const f of FILES) {
    if (f === "common.mts" || f === "index.mts") continue;
    const src = readFileSync(join(DIR, f), "utf-8");
    assert.match(src, /export const profile: LangProfile = \{/, `${f}: нет экспорта profile`);
    assert.match(src, /import \{ COMMON, EROTIC_NOTE \}/, `${f}: не подключён общий блок`);
    // поля контракта LangProfile
    for (const field of ["code:", "name:", "rules:", "forbidden:", "fewshot:", "judgeNotes:"]) {
      assert.ok(src.includes(field), `${f}: нет поля ${field}`);
    }
  }
});

test("LANGS собирается из 10 модулей, коды совпадают с именами файлов", () => {
  assert.equal(Object.keys(LANGS).length, 10);
  for (const [code, p] of Object.entries(LANGS)) {
    assert.equal(p.code, code, `${code}: код в профиле не совпадает с ключом`);
    assert.equal(p.name.length > 0, true);
    assert.ok(FILES.includes(`${code}.mts`), `${code}: файла нет`);
  }
});

test("few-shot: у каждого языка есть проверенные примеры (после атомизации 2026-10-26)", () => {
  // До этого few-shot был только у es (4), у 9 языков — 0. Это была главная
  // дыра качества для 9B-модели.
  for (const [code, p] of Object.entries(LANGS)) {
    assert.ok(p.fewshot.length >= 1, `${code}: few-shot пуст`);
    for (const [en, tr] of p.fewshot) {
      assert.ok(en.trim().length > 0 && tr.trim().length > 0, `${code}: пустой пример`);
      assert.notEqual(en.trim(), tr.trim(), `${code}: пример-копия (не перевод): ${en}`);
    }
  }
});

test("few-shot не тащит плейсхолдеры и чужие языки в промпт", () => {
  for (const [code, p] of Object.entries(LANGS)) {
    for (const [en, tr] of p.fewshot) {
      assert.ok(!/%[sd]|\[config|\{\/?[a-zA-Z]/.test(en), `${code}: плейсхолдер в EN-примере`);
      // кириллица/CJK допустимы только у соответствующих языков
      const cjk = /[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(tr);
      const cyr = /[\u0400-\u04ff]/.test(tr);
      if (code === "ru") assert.ok(cyr && !cjk, `ru: пример не кириллицей`);
      else if (["ja", "ko", "zh"].includes(code)) assert.ok(cjk && !cyr, `${code}: пример не целевым скриптом`);
      else assert.ok(!cyr && !cjk, `${code}: чужая письменность в примере`);
    }
  }
});

test("common.mts: общий блок экспортируется и не пуст", () => {
  assert.ok(COMMON.includes("HARD RULES"));
  assert.ok(COMMON.includes('"tr"'), "ключ JSON обязан быть нейтральным tr");
  assert.ok(!COMMON.includes('"es":"<translation>"'), "легаси-ключ es должен быть убран");
  assert.ok(EROTIC_NOTE.includes("EROTIC PROSE"));
  const t: LangProfile = LANGS.de;
  assert.ok(t.rules.includes(COMMON.slice(0, 40)), "профиль подключает COMMON");
});

test("langProfile: неизвестный код — явная ошибка со списком доступных", () => {
  assert.throws(() => langProfile("xx"), /Неизвестный язык "xx"/);
  assert.equal(langProfile("de").name, "Deutsch");
});

test("файлы профилей отформатированы prettier (нет мусорного отступа)", () => {
  for (const f of FILES) {
    const p = join(DIR, f);
    assert.ok(statSync(p).size > 500, `${f}: подозрительно мал`);
    const src = readFileSync(p, "utf-8");
    assert.ok(!/^ {6}code:/m.test(src), `${f}: остался лишний отступ от старого объекта`);
  }
});
