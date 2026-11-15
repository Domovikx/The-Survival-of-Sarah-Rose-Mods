/**
 * dump_locales.mts — плоский дамп каталога локалей для вычитки.
 *
 * Разбор построчный: ключ — строка, начинающаяся с двух пробелов и кавычки
 * (prettier может унести `{` на следующую строку), значения — строки `lang: "…"`
 * с отступом 4–6 (тоже зависит от переноса). Значения распаковываем JSON.parse.
 *
 * Запуск (из корня репы):
 *   node .opencode/skills/site-locales/dump_locales.mts > tmp/locales_review.txt
 */
import { readFileSync } from "node:fs";

const SRC = "site/src/shared/config/i18n.locales.ts";
const LANGS = ["zh", "ru", "es", "pt", "de", "ja", "fr", "pl", "ko", "it"] as const;

const KEY_LINE = /^ {2}("(?:[^"\\]|\\.)*"):\s*\{?$/;
const VALUE_LINE = /^\s{4,6}(\w+): ("(?:[^"\\]|\\.)*"),?$/;
const CLOSE = /^\}( as const)?\);$/;

const entries: Array<{ key: string; values: Map<string, string> }> = [];
let current: { key: string; values: Map<string, string> } | undefined;
let inside = false;
for (const line of readFileSync(SRC, "utf-8").split(/\r?\n/)) {
  if (!inside) {
    if (line.startsWith("export const CATALOGUE = dict({")) inside = true;
    continue;
  }
  if (CLOSE.test(line)) break;
  const keyMatch = KEY_LINE.exec(line);
  if (keyMatch) {
    current = { key: JSON.parse(keyMatch[1]!) as string, values: new Map() };
    entries.push(current);
    continue;
  }
  const valueMatch = VALUE_LINE.exec(line);
  if (valueMatch && current) current.values.set(valueMatch[1]!, JSON.parse(valueMatch[2]!) as string);
}

console.log(`ключей: ${entries.length}\n`);
entries.forEach(({ key, values }, index) => {
  console.log(`### ${index + 1}. ${key}`);
  for (const lang of LANGS) console.log(`${lang}: ${values.get(lang) ?? "—"}`);
  console.log();
});
