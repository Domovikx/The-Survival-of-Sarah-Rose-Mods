/**
 * ui_font_presets.test.mts — страж кеглей интерфейса и стартового применения.
 *
 * ПОЧЕМУ ЭТОТ ТЕСТ СУЩЕСТВУЕТ (два реальных бага, 2026-11-14):
 *
 * 1) CJK-надбавка НЕ доезжала до игрока. На старте настройки применялись в
 *    init, но базовая игра переприменяет свои gui.* после наших init-блоков —
 *    и zh/ja/ko стартовали с базовым кеглем (проверено пробой на живом
 *    клиенте: zh получал 30 px вместо 32). Лечение — стартовый колбэк; тест
 *    стережёт, чтобы хук не потеряли при рефакторинге.
 *
 * 2) Кегли были «магическими числами»: правка одного значения в таблице или в
 *    формуле применения молча ломала читаемость иероглифов. Тест фиксирует
 *    инварианты (4 набора, 6 кеглей, дельты, единый механизм применения).
 *
 * ИСТОЧНИК ДАННЫХ — сам zzz_ui.rpy (он же конфиг, он же потребитель: init
 * python -> gui.* -> стили). Второй копии нет намеренно, поэтому и сверять
 * нечего: проверяем не «совпадает с копией», а сами правила.
 *
 * Плюс проверяется продуктовое правило: в меню мода — только те настройки,
 * что дают игроку ценность (реплики, имена, интерфейс). Служебные кегли
 * (заголовки/уведомления/титул) — внутренние, ручка в меню это инфошум.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const UI = join(ROOT, "zzz_ui.rpy");

type Group = Record<string, number>;

/** Ожидаемые ключи кеглей: text (реплики), name (имя говорящего), iface
 *  (интерфейс), label (заголовки), notify (тосты), title (титул меню). */
const KEYS = ["text", "name", "iface", "label", "notify", "title"];

const uiSource = (): string => readFileSync(UI, "utf-8");

/** Достаёт таблицу TSSR_FONT_GROUPS из zzz_ui.rpy: строки вида
 *  `"base": {"text": 32, "name": 38, ...},` — по одной группе на строку. */
function parseGroups(src: string): Record<string, Group> {
  const block = /TSSR_FONT_GROUPS = \{([\s\S]*?)\n {4}\}/.exec(src);
  assert.ok(block, "в zzz_ui.rpy не найден TSSR_FONT_GROUPS");
  const groups: Record<string, Group> = {};
  for (const m of block[1].matchAll(/"(\w+)": \{([^}]+)\}/g)) {
    const group: Group = {};
    for (const kv of m[2].matchAll(/"(\w+)": (\d+)/g)) group[kv[1]] = Number(kv[2]);
    groups[m[1]] = group;
  }
  return groups;
}

test("наборов ровно четыре: база + zh/ja/ko, у каждого все шесть кеглей", () => {
  const groups = parseGroups(uiSource());
  assert.deepEqual(Object.keys(groups).toSorted(), ["base", "ja", "ko", "zh"]);
  for (const [name, group] of Object.entries(groups)) {
    assert.deepEqual(Object.keys(group).toSorted(), [...KEYS].toSorted(), `набор ${name}: ключи`);
    for (const [key, value] of Object.entries(group)) {
      assert.ok(Number.isInteger(value) && value > 0, `набор ${name}.${key} должен быть целым > 0`);
    }
  }
});

test("дельты иероглифических наборов: zh и ja +2, ko +1 ко всем кеглям", () => {
  const groups = parseGroups(uiSource());
  const base = groups.base;
  for (const key of KEYS) {
    assert.equal(groups.zh[key] - base[key], 2, `zh.${key}`);
    assert.equal(groups.ja[key] - base[key], 2, `ja.${key}`);
    assert.equal(groups.ko[key] - base[key], 1, `ko.${key}`);
  }
});

test("дефолты persistent строятся из базы, а не дублируются числами", () => {
  const src = uiSource();
  for (const [key, field] of [
    ["text", "font_text_size"],
    ["name", "font_name_size"],
    ["iface", "font_interface_size"],
    ["label", "font_label_size"],
    ["notify", "font_notify_size"],
    ["title", "font_title_size"],
  ] as const) {
    assert.match(
      src,
      new RegExp(`'${field}': TSSR_FONT_GROUPS\\['base'\\]\\['${key}'\\]`),
      `FONT_DEFAULTS['${field}'] должен браться из TSSR_FONT_GROUPS['base']['${key}']`,
    );
  }
});

test("надбавка применяется на СТАРТЕ, а не только при смене языка", () => {
  const src = uiSource();
  assert.match(src, /config\.start_callbacks\.append\(tssr_apply_fonts_at_start\)/);
  // Колбэк обязан: сбросить gui.* к define-значениям (gui.rebuild), затем
  // применить свои размеры С пересборкой стилей. Без этой связки кегли видны
  // только в gui.*, а на экране остаются игровые (проверено E2E 2026-11-14).
  const fn = /def tssr_apply_fonts_at_start\(\):([\s\S]*?)\n {4}\S/.exec(src);
  assert.ok(fn, "нет функции tssr_apply_fonts_at_start");
  assert.match(fn[1], /gui\.rebuild\(\)/);
  assert.match(fn[1], /update_font_styles\(rebuild=True\)/);
});

test("размеры доходят до СТИЛЕЙ, а не только до gui.*", () => {
  const src = uiSource();
  // В этой игре текст рисуется собственными стилями с жёсткими кеглями —
  // запись в gui.* без назначения стилям игрок не увидит.
  const fn = /def tssr_apply_text_styles\(rebuild=False\):([\s\S]*?)\n {4}def /.exec(src);
  assert.ok(fn, "нет функции tssr_apply_text_styles");
  for (const st of ["say_dialogue", "say_label", "choice_button_text"]) {
    assert.ok(fn[1].includes(`("${st}"`), `стиль ${st} должен получать размер`);
  }
  assert.match(fn[1], /renpy\.style\.rebuild\(\)/, "после назначения стилей нужна пересборка");
  assert.match(src, /tssr_apply_text_styles\(rebuild\)/, "update_font_styles должен передавать флаг rebuild");
});

test("у каждого кегля свой размер из набора языка (нет общей надбавки)", () => {
  const src = uiSource();
  const fn = /def update_font_styles\(rebuild=False\):([\s\S]*?)\n {4}def /.exec(src);
  assert.ok(fn, "нет функции update_font_styles");
  const pairs: [string, string][] = [
    ["text", "text_size"],
    ["name", "name_text_size"],
    ["iface", "interface_text_size"],
    ["label", "label_text_size"],
    ["notify", "notify_text_size"],
    ["title", "title_text_size"],
  ];
  for (const [key, gui] of pairs) {
    assert.match(
      fn[1],
      new RegExp(`gui\\.${gui} = persistent\\.font_\\w+ \\+ tssr_size_delta\\('${key}'\\)`),
      `кегль ${gui} должен брать дельту набора (${key})`,
    );
  }
  assert.doesNotMatch(src, /TSSR_LANG_SIZE_BUMP|tssr_size_bump/, "старая общая надбавка должна быть выпилена");
});

test("в меню мода — только три ценные настройки, служебные кегли не выведены", () => {
  const src = uiSource();
  const rows = /TSSR_FS_ROWS = \[([\s\S]*?)\n {4}\]/.exec(src);
  assert.ok(rows, "нет TSSR_FS_ROWS");
  const fields = [...rows[1].matchAll(/\("(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(fields, ["font_text_size", "font_name_size", "font_interface_size"]);
  for (const noisy of ["font_title_size", "font_notify_size", "font_label_size"]) {
    assert.ok(!fields.includes(noisy), `${noisy} не должен быть ручкой в меню (инфошум)`);
  }
});

test("gui.rebuild() не вызывается на этапе init (иначе падение старта)", () => {
  const src = uiSource();
  // Разрешённые места — ВНУТРИ функций (отступ 8): стартовый колбэк и
  // tssr_apply_language_font. Отступ ровно 4 = верхний уровень init python:
  // там rebuild падает (clean_store_backup ещё None).
  assert.doesNotMatch(src, /^ {4}gui\.rebuild\(\)$/m, "rebuild на верхнем уровне init python запрещён");
  assert.match(src, /^ {8}gui\.rebuild\(\)$/m, "rebuild должен быть в рантайм-функциях");
});

test("в .rpy не используется __file__ (движок подменяет его на minstore.py)", () => {
  // Комментарии не считаем: в предупреждении-доке слово как раз упоминается.
  const code = uiSource()
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  assert.doesNotMatch(code, /__file__/);
});
