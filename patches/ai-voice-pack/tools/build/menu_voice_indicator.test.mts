/**
 * menu_voice_indicator.test.mts — страж индикатора озвучки на кнопках языков.
 *
 * ЗАЧЕМ (запрос владельца, 2026-11-14): main-архив несёт только ТЕКСТОВЫЕ
 * переводы, голоса лежат отдельными паками voice-<lang>. Игрок ставит main,
 * слышит тишину и не понимает почему → на кнопке языка нужен индикатор.
 *
 * ПОЧЕМУ СИМВОЛ, А НЕ ЦВЕТНАЯ ТОЧКА: владелец («дальтоники ругаются») —
 * смысл несёт ФОРМА: ♪ = звук есть, ♪ зачёркнутая ({s}♪{/s}) = только текст.
 *
 * ПОЧЕМУ FontGroup: в Literata (латиница/кириллица) НЕТ ♪ (проверено fontTools
 * 2026-11-14), поэтому подпись языка собирается FontGroup'ом: Literata для
 * текста + Noto для диапазона символов. Без фолбэка игрок увидел бы «тофу».
 *
 * Проверяем:
 *   1) подпись собирается символом ♪ / {s}♪{/s}, а не картинкой и не цветом;
 *   2) для латиницы шрифт подписи — FontGroup с фолбэком на Noto;
 *   3) в сетке языков используется tssr_lang_label (а не голый title);
 *   4) счётчик аудио кешируется и считает только .opus/.wav;
 *   5) английский учитывается как язык (в меню он хранится как None);
 *   6) легенда переведена во всех языках;
 *   7) предупреждение про отсутствие пака показывается ТОЛЬКО когда файлов нет.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const UI = join(ROOT, "zzz_ui.rpy");
const REPO = resolve(ROOT, "..", "..");
const CANON = JSON.parse(readFileSync(join(REPO, "config", "language-priority.json"), "utf-8")) as {
  languages: { code: string }[];
};
const LANGS = CANON.languages.map((l) => l.code).filter((c) => c !== "en");

const src = (): string => readFileSync(UI, "utf-8");

test("подпись языка: ♪ для озвученного и перечёркнутая ♪ для текстового", () => {
  const fn = /def tssr_lang_label\(code, title\):([\s\S]*?)\n {4}def /.exec(src());
  assert.ok(fn, "нет функции tssr_lang_label");
  assert.match(fn[1], /♪ %s/, "нет ветки с нотой для озвученного языка");
  assert.match(fn[1], /\{s\}♪\{\/s\} %s/, "нет ветки с перечёркнутой нотой");
  assert.match(fn[1], /tssr_voice_count\(/, "подпись должна спрашивать счётчик");
  // цвет/картинки больше не несут смысл (доступность)
  assert.doesNotMatch(fn[1], /image=/, "индикатор не должен быть картинкой");
});

test("символ ♪ рисуется через FontGroup (в Literata его нет)", () => {
  const s = src();
  const fn = /def tssr_symbol_font\(\):([\s\S]*?)\n {4}def /.exec(s);
  assert.ok(fn, "нет функции tssr_symbol_font");
  assert.match(fn[1], /FontGroup\(\)/, "нужен FontGroup");
  assert.match(fn[1], /Literata-Bold\.ttf/, "основной шрифт — Literata");
  assert.match(fn[1], /NotoSansCJKsc-Regular\.otf/, "символы берём из Noto (там ♪ есть)");
  // шрифт подписи языка должен использовать этот фолбэк
  const langFont = /def tssr_lang_font\(code\):([\s\S]*?)\n {4}def /.exec(s);
  assert.ok(langFont, "нет tssr_lang_font");
  assert.match(langFont[1], /tssr_symbol_font\(\)/, "подпись языка должна брать FontGroup-фолбэк");
});

test("в легенде — те же символы, что и на кнопках", () => {
  const s = src();
  assert.match(s, /"♪ {2}" \+ tssr_tr\("voice pack installed"\)|\("♪ {1,2}" \+ tssr_tr\("voice pack installed"\)\)/);
  assert.match(s, /\{s\}♪\{\/s\}/, "в легенде должна быть перечёркнутая нота");
});

test("кнопки языков строятся через tssr_lang_label (индикатор не потеряется)", () => {
  const s = src();
  assert.match(s, /textbutton tssr_lang_label\(code, title\):/, "сетка языков должна звать tssr_lang_label");
  assert.doesNotMatch(s, /textbutton title:/, "голый title вернёт кнопки без индикатора");
});

test("счётчик аудио кешируется и считает только opus/wav", () => {
  const s = src();
  assert.match(s, /TSSR_VOICE_COUNTS = \{\}/, "нужен кеш счётчиков (скан папок не каждый кадр)");
  const fn = /def tssr_voice_count\(code\):([\s\S]*?)\n {4}def /.exec(s);
  assert.ok(fn, "нет функции tssr_voice_count");
  assert.match(fn[1], /\.opus/);
  assert.match(fn[1], /\.wav/);
  assert.match(fn[1], /TSSR_VOICE_COUNTS\[code\] = total/, "результат должен класться в кеш");
});

test("английский учитывается как язык (в меню он хранится как None)", () => {
  const fn = /def tssr_voice_codes\(\):([\s\S]*?)\n {4}def /.exec(src());
  assert.ok(fn, "нет tssr_voice_codes");
  assert.match(fn[1], /"en" if c is None else c/, "None должен считаться как en");
});

test("легенда переведена во всех языках", () => {
  const s = src();
  for (const key of ["voice pack installed", "no voice pack - text only"]) {
    const pairs = [...s.matchAll(new RegExp(`old "${key}"\\s*\\n\\s*new "([^"]*)"`, "g"))].length;
    assert.equal(pairs, LANGS.length, `«${key}» переведена ${pairs} раз(а), ожидалось ${LANGS.length}`);
  }
});

test("предупреждение показывается только когда файлов нет", () => {
  assert.match(
    src(),
    /if not tssr_voice_count\(preferences\.language or "en"\):/,
    "строка «нет озвучки» должна быть под условием отсутствия файлов",
  );
});
