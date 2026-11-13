/**
 * font_guard.test.mts — гарантия, что сабсетнутые CJK-шрифты не дают «тофу».
 *
 * Сабсет сжал 47.05 MiB в 4.32 MiB (-91%), и единственный способ не выстрелить
 * этим в лицо игроку — проверять покрытие ФАКТИЧЕСКОГО текста каждого языка,
 * а не «на глаз» и не после релиза. Здесь проверяется ровно то, что увидит
 * игрок: символы из po/<lang>.po против шрифта, который игра ставит для этого
 * языка (TSSR_LANG_FONT в zzz_ui.rpy — карта читается из исходника, а не
 * дублируется в тесте).
 *
 * Отдельно: страховка от повторного прогона subset_fonts.mts на уже
 * сабсетнутом файле (там потеря глифов была бы молчаливой) и контроль
 * размера/лицензии — шрифты под OFL, без OFL.txt их распространять нельзя.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { missingGlyphs } from "./font_coverage.mts";
import { languageCharset, poFileCharset } from "./font_charset.mts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FONTS = join(ROOT, "fonts");
const PO = join(ROOT, "po");
const UI = join(ROOT, "zzz_ui.rpy");

/** Потолок на один сабсет: полный Noto — 15.7 MiB, наш — 1.4–1.5 MiB. */
const MAX_SUBSET_BYTES = 3 << 20;
/** Нижняя граница: подозрительно маленький файл = битый/пустой шрифт. */
const MIN_SUBSET_BYTES = 0.5 << 20;

/**
 * Карта «язык → шрифт» ИЗ ИГРЫ: блок TSSR_LANG_FONT в zzz_ui.rpy. Тест обязан
 * проверять тот же шрифт, который реально подставит Ren'Py.
 */
function languageFonts(): Map<string, string> {
  const src = readFileSync(UI, "utf-8");
  const block = /TSSR_LANG_FONT\s*=\s*\{([\s\S]*?)\}/u.exec(src);
  assert.ok(block, "в zzz_ui.rpy не найден TSSR_LANG_FONT — тест потерял карту языков");
  const out = new Map<string, string>();
  for (const m of block[1].matchAll(/"([a-z]{2,3})":\s*"fonts\/([^"]+)"/gu)) out.set(m[1], m[2]);
  return out;
}

/** Общие шрифты (латиница/кириллица — есть у всех языков). */
const LITERATA = join(FONTS, "Literata-Regular.ttf");

test("test_language_font_mapping_points_to_shipped_subsets", () => {
  const fonts = languageFonts();
  assert.ok(fonts.size > 0, "карта языков пуста");
  for (const [lang, file] of fonts) {
    const path = join(FONTS, file);
    assert.ok(existsSync(path), `${lang}: игра ссылается на ${file}, а файла нет в fonts/`);
    const size = statSync(path).size;
    assert.ok(
      size >= MIN_SUBSET_BYTES && size <= MAX_SUBSET_BYTES,
      `${lang}: ${file} весит ${(size / (1 << 20)).toFixed(2)} MiB — вне окна сабсета ` +
        `(${(MIN_SUBSET_BYTES / (1 << 20)).toFixed(1)}–${MAX_SUBSET_BYTES / (1 << 20)} MiB)`,
    );
  }
});

test("test_subset_font_covers_every_character_of_its_language", () => {
  // Набор языка = ровно то, что игрок увидит: PO + tl/<lang>/*.rpy (их грузит
  // игра) + инлайн-переводы панели мода в zzz_ui.rpy.
  for (const [lang, file] of languageFonts()) {
    const chars = languageCharset(ROOT, lang);
    assert.ok(chars.length > 100, `${lang}: набор языка подозрительно мал (${chars.length})`);
    const missing = missingGlyphs(join(FONTS, file), chars);
    assert.deepEqual(
      missing.slice(0, 20).map((c) => `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase()}`),
      [],
      `${lang}: ${file} не умеет ${missing.length} символов своего текста — в игре будет пустота вместо букв`,
    );
  }
});

test("test_whole_corpus_is_covered_by_shipped_fonts", () => {
  // Каждый символ любого языка обязан рисоваться парой «шрифт языка + Literata»
  // (так игра и работает: Literata — основная, Noto закрывает CJK). Языки без
  // записи в TSSR_LANG_FONT идут на Literata целиком — это тоже проверяем.
  const fonts = languageFonts();
  const langs = ["en", "zh", "ru", "es", "pt", "de", "ja", "fr", "pl", "ko", "it"];
  for (const lang of langs) {
    const chars = lang === "en" ? poFileCharset(join(PO, "template.pot")) : languageCharset(ROOT, lang);
    const langFont = fonts.get(lang);
    const missLang = new Set(langFont === undefined ? [] : missingGlyphs(join(FONTS, langFont), chars));
    const missBase = new Set(missingGlyphs(LITERATA, chars));
    const uncovered = [...missLang].filter((c) => missBase.has(c));
    assert.deepEqual(
      uncovered.slice(0, 20).map((c) => `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase()}`),
      [],
      `${lang}: ${uncovered.length} символов не рисует НИ ОДИН шрифт пака`,
    );
    if (langFont === undefined) {
      // Не-CJK языки целиком зависят от Literata — тут дыр быть не должно.
      assert.deepEqual(
        [...missBase].slice(0, 20).map((c) => `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase()}`),
        [],
        `${lang}: Literata не умеет символы этого языка`,
      );
    }
  }
});

test("test_subset_total_size_stays_small", () => {
  const total = [...languageFonts().values()].reduce((sum, f) => sum + statSync(join(FONTS, f)).size, 0);
  const mib = total / (1 << 20);
  assert.ok(mib < 6, `суммарный вес CJK-шрифтов ${mib.toFixed(2)} MiB — сабсет потерян`);
});

test("test_font_license_ships_with_pack", () => {
  const ofl = join(FONTS, "OFL.txt");
  assert.ok(existsSync(ofl), "в fonts/ нет OFL.txt — распространять шрифты нельзя");
  const text = readFileSync(ofl, "utf-8");
  for (const needle of ["SIL OPEN FONT LICENSE", "Literata", "Noto Sans CJK", "subsetted"]) {
    assert.ok(text.includes(needle), `OFL.txt не упоминает «${needle}»`);
  }
});

test("test_subset_script_refuses_already_subsetted_source", () => {
  // Прогон на сабсете не может вернуть глифы, которых в наборе не было:
  // генератор обязан отказать, а не молча «пересобрать» урезанное ещё раз.
  const r = spawnSync(process.execPath, [join(ROOT, "tools", "build", "subset_fonts.mts")], {
    encoding: "utf-8",
    timeout: 60_000,
  });
  assert.notEqual(r.status, 0, "subset_fonts.mts не отказал на уже сабсетнутом шрифте");
  assert.match(
    `${r.stderr ?? ""}${r.stdout ?? ""}`,
    /уже сабсетнут/u,
    "отказ обязан объяснять причину («уже сабсетнут»)",
  );
});
