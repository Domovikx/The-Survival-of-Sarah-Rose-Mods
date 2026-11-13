/**
 * font_charset.mts — набор символов, которые мод обязан уметь НАРИСОВАТЬ.
 *
 * Источник истины — тексты, которые реально попадают на экран, и брать их надо
 * оттуда, откуда их берёт игра:
 *   1) PO/POT каталог (диалоги, меню, титры) — po/*.po, po/template.pot;
 *   2) файлы переводов tl/<lang>/*.rpy — именно они грузятся в игру;
 *   3) инлайн-переводы панели мода в zzz_ui.rpy (`translate <lang> strings:`);
 *   4) блоки типографики/символов, которые UI печатает без перевода.
 *
 * Пункты 2-3 — не «на всякий случай»: 2026-11-13 сабсет набора только из PO
 * дал в игре пустые места вместо «링크», «켬», «적용됩니다» — эти строки живут
 * в zzz_ui.rpy, а не в PO.
 *
 * Зачем: этим набором (а) режется CJK-шрифт (subset_fonts.mts: 15.7 -> 1.6
 * MiB на язык), (б) проверяется, что ни в одном шрифте не осталось «тофу»
 * (font_guard.test.mts: покрытие фактического текста каждого языка).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Символы, которые обязаны быть всегда — даже если их нет в переводах:
 * ASCII (имена, цифры, форматирование), Latin-1 (é/ü в именах), пунктуация,
 * валюты, стрелки, рамки, геометрия (▶ ▸ ✕ в UI), CJK-пунктуация, fullwidth.
 */
const ALWAYS_BLOCKS: ReadonlyArray<readonly [number, number]> = [
  [0x0020, 0x007e],
  [0x00a0, 0x00ff],
  [0x2010, 0x2027],
  [0x2030, 0x205e],
  [0x20a0, 0x20bf],
  [0x2190, 0x21ff],
  [0x2500, 0x257f],
  [0x25a0, 0x25ff],
  [0x2600, 0x26ff],
  [0x3000, 0x303f],
  [0xff00, 0xffef],
];

/** Управляющие символы на экран не попадают (и глифов у них нет). */
// eslint-disable-next-line no-control-regex -- ровно эти символы и надо отсеять
const CONTROL = /[\u0000-\u001f\u007f-\u009f\ufeff]/u;

/** Все строковые значения PO/POT (msgid + msgstr; многострочные склеиваются). */
function poStrings(text: string): string[] {
  const out: string[] = [];
  let cur: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("msgid") || line.startsWith("msgstr")) {
      if (cur !== null) out.push(cur);
      cur = "";
      const q = line.indexOf('"');
      if (q >= 0) cur = line.slice(q + 1, line.lastIndexOf('"'));
    } else if (cur !== null && line.startsWith('"')) {
      cur += line.slice(1, line.lastIndexOf('"'));
    } else if (line.trim() === "" && cur !== null) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur !== null) out.push(cur);
  return out;
}

/** Все .rpy рекурсивно (переводы лежат деревьями по аркам). */
function rpyFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // языка/каталога нет — не ошибка
  }
  for (const name of entries) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...rpyFiles(path));
    else if (name.endsWith(".rpy")) out.push(path);
  }
  return out;
}

function addText(chars: Set<string>, text: string): void {
  for (const ch of text) if (!CONTROL.test(ch)) chars.add(ch);
}

/**
 * Текст инлайн-переводов `translate <lang> strings:` из zzz_ui.rpy: панель
 * мода переведена прямо в .rpy (не в PO), и её символы тоже нужны шрифту.
 */
function inlineBlock(uiFile: string, lang: string | null): string {
  let src: string;
  try {
    src = readFileSync(uiFile, "utf-8");
  } catch {
    return "";
  }
  const blocks = src.split(/^(?=translate\s+\w+\s)/mu);
  return blocks
    .filter((b) =>
      lang === null ? /^translate\s+\w+\s/u.test(b) : new RegExp(`^translate\\s+${lang}\\s`, "u").test(b),
    )
    .join("\n");
}

/** Все .po/.pot каталога. */
function poChars(poDir: string, chars: Set<string>): void {
  for (const name of readdirSync(poDir)) {
    if (!/\.(po|pot)$/i.test(name)) continue;
    for (const s of poStrings(readFileSync(join(poDir, name), "utf-8"))) addText(chars, s);
  }
}

/** Символы по кодпоинту, без повторов — стабильный порядок для отчётов. */
function sorted(chars: Set<string>): string[] {
  return [...chars].toSorted((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0));
}

/**
 * ПОЛНЫЙ набор для сабсета: PO/POT + ВСЕ .rpy патча (tl/<lang> и zzz_ui.rpy с
 * инлайн-переводами) + блоки «всегда». Лишние ASCII-символы кода безвредны,
 * пропущенный символ перевода — «тофу» в игре.
 *
 * @param patchRoot корень патча (patches/ai-voice-pack)
 */
export function usedCharset(patchRoot: string): string[] {
  const chars = new Set<string>();
  for (const [from, to] of ALWAYS_BLOCKS) {
    for (let cp = from; cp <= to; cp++) chars.add(String.fromCodePoint(cp));
  }
  poChars(join(patchRoot, "po"), chars);
  for (const file of rpyFiles(join(patchRoot, "tl"))) addText(chars, readFileSync(file, "utf-8"));
  addText(chars, inlineBlock(join(patchRoot, "zzz_ui.rpy"), null));
  return sorted(chars);
}

/**
 * Набор ОДНОГО языка — ровно то, что игрок увидит, выбрав его: PO + tl/<lang> +
 * инлайн-блок zzz_ui.rpy. Этим проверяется покрытие шрифта языка (тоже до
 * сборки), поэтому источник совпадает с usedCharset().
 */
export function languageCharset(patchRoot: string, lang: string): string[] {
  const chars = new Set<string>();
  const po = join(patchRoot, "po", `${lang}.po`);
  try {
    for (const s of poStrings(readFileSync(po, "utf-8"))) addText(chars, s);
  } catch {
    // у en PO нет — текст берётся из template.pot/самой игры
  }
  for (const file of rpyFiles(join(patchRoot, "tl", lang))) addText(chars, readFileSync(file, "utf-8"));
  addText(chars, inlineBlock(join(patchRoot, "zzz_ui.rpy"), lang));
  return sorted(chars);
}

/** Символы одного PO/POT-файла (для узких проверок в тестах). */
export function poFileCharset(file: string): string[] {
  const chars = new Set<string>();
  for (const s of poStrings(readFileSync(file, "utf-8"))) addText(chars, s);
  return sorted(chars);
}
