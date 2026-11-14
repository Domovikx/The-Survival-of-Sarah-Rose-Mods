/**
 * ui_strings.test.mts — страж строк UI-перевода (tl/<lang>/screens.rpy).
 *
 * ПОЧЕМУ ОН ЕСТЬ (найдено 2026-11-14): на живом клиенте главное меню в русской
 * игре показывало English. Проба перехватила запросы перевода у движка и
 * показала, что строк `Start / Settings / Exit` в таблице ВООБЩЕ нет
 * (при том что `Load`, `Back`, `Skip` есть и переводятся). Причина — не
 * «перевод сломался», а «строку никто не добавил». Именно этот класс ошибок
 * (языки разъехались по составу строк) тест и ловит.
 *
 * ВАЖНО ПО ФАКТАМ: кнопки главного меню в этой игре — КАРТИНКИ с запечённым
 * текстом (game/gui/main_menu_start_idle.png и т.п.), поэтому строки ниже их
 * не заменят; они нужны для остальных экранов (сохранения, подтверждения,
 * выход) и чтобы состав языков не расходился.
 *
 * Что проверяем:
 *   1) у всех языков ОДИН И ТОТ ЖЕ набор `old` (структурный паритет);
 *   2) ядро меню (Start/Settings/Exit/Quit/Continue/Main Menu/Quick Save/
 *      Quick Load/Delete) есть в каждом языке и не пустое;
 *   3) в одном файле нет дублей `old` (Ren'Py на дублях падает);
 *   4) файлы не содержат табов (в .rpy это ошибка отступов).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TL = join(ROOT, "tl");

/** Языки берём из канона порядка (config/language-priority.json), а не из
 *  головы: правило проекта — любой список языков идёт в этом порядке. */
const REPO = resolve(ROOT, "..", "..");
const CANON = JSON.parse(readFileSync(join(REPO, "config", "language-priority.json"), "utf-8")) as {
  languages: { code: string }[];
};
const LANGS = CANON.languages.map((l) => l.code).filter((c) => c !== "en");

/** Ядро меню/сохранений: без этих строк UI остаётся английским. */
/** Ядро меню/сохранений: без этих строк UI остаётся английским.
 *  ВНИМАНИЕ: "Exit" сюда НЕ входит — это кнопка-КАРТИНКА главного меню
 *  (game/gui/main_menu_exit_idle.png), движок её не запрашивает, и строка
 *  только дублировала "Quit". */
const CORE = ["Start", "Settings", "Quit", "Continue", "Main Menu", "Quick Save", "Quick Load", "Delete"];

/** Подписи, которые игрок видит ОДНОВРЕМЕННО: нижняя панель в игре.
 *  Разные кнопки не имеют права выглядеть одинаково (баг «Сохранить» дважды). */
const QUICK = ["Back", "History", "Skip", "Auto", "Save", "Q.Save", "Q.Load", "Prefs"];

type Pair = { old: string; next: string };

/** Пары old/new из `translate <lang> strings:` — порядок сохраняем, потому что
 *  важен смысл «эта строка идёт за этой». */
function pairs(lang: string): Pair[] {
  const src = readFileSync(join(TL, lang, "screens.rpy"), "utf-8").replace(/\r\n/g, "\n");
  const out: Pair[] = [];
  const re = /^\s*old "((?:[^"\\]|\\.)*)"\n\s*new "((?:[^"\\]|\\.)*)"/gm;
  for (const m of src.matchAll(re)) out.push({ old: m[1], next: m[2] });
  return out;
}

test("все языки имеют одинаковый состав строк UI (структурный паритет)", () => {
  const base = pairs(LANGS[0])
    .map((p) => p.old)
    .toSorted();
  assert.ok(base.length > 0, "не разобрано ни одной строки — проверь формат файла");
  for (const lang of LANGS.slice(1)) {
    assert.deepEqual(
      pairs(lang)
        .map((p) => p.old)
        .toSorted(),
      base,
      `язык ${lang} разошёлся по составу строк`,
    );
  }
});

test("ядро меню переведено в каждом языке (Start/Settings/Exit/…)", () => {
  for (const lang of LANGS) {
    const map = new Map(pairs(lang).map((p) => [p.old, p.next]));
    for (const key of CORE) {
      assert.ok(map.has(key), `${lang}: нет строки «${key}»`);
      assert.ok((map.get(key) ?? "").trim().length > 0, `${lang}: «${key}» переведена пустой строкой`);
    }
  }
});

test("нет дублей old в одном языке (Ren'Py падает на дублях)", () => {
  for (const lang of LANGS) {
    const seen = new Set<string>();
    for (const p of pairs(lang)) {
      assert.ok(!seen.has(p.old), `${lang}: дубль строки «${p.old}»`);
      seen.add(p.old);
    }
  }
});

test("быстрые кнопки нижней панели не совпадают с обычными", () => {
  // Реальный баг 2026-11-14: в ru/fr/pl/ko Save и Q.Save переводились одним
  // словом — в нижней панели стояли две одинаковые кнопки.
  for (const lang of LANGS) {
    const tr = new Map(pairs(lang).map((p) => [p.old, p.next.trim()]));
    const seen = new Map<string, string>();
    for (const key of QUICK) {
      const text = tr.get(key);
      if (!text) continue;
      const other = seen.get(text);
      assert.ok(!other, `${lang}: «${key}» и «${other}» подписаны одинаково («${text}») — игрок не различит кнопки`);
      seen.set(text, key);
    }
  }
});

test("в tl-файлах нет табов (в .rpy табы ломают отступы)", () => {
  for (const lang of LANGS) {
    const src = readFileSync(join(TL, lang, "screens.rpy"), "utf-8");
    assert.ok(!src.includes("\t"), `${lang}: в screens.rpy есть табы`);
  }
});
