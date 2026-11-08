/**
 * po_recover.mts — восстановление po после порчи шапки.
 *
 * Два класса дефекта (2026-11-03):
 *   1. ru.po: шапка продублирована 10 раз — писатель брал parsePo БЕЗ фильтра
 *      msgid="" и каждая запись дописывала ещё одну копию шапки.
 *   2. de.po: шапка «взорвана» в посимвольные строки — renderPo получила
 *      СТРОКУ вместо массива строк (`[...comment]` = символы через перевод строки).
 *
 * Вход: файл (записи обязаны быть целы) + опционально --header-from <файл>,
 * откуда взять здоровую шапку (нужно для de: своя шапка уничтожена).
 * Выход: шапка (ровно одна) + все записи; счётчики записей/переводов ДО и ПОСЛЕ
 * обязаны совпасть — иначе выход в 1, ничего не пишем.
 */
import { readFileSync } from "node:fs";

import { parsePo, writePoAtomic } from "../.opencode/skills/renpy-po/po_core.mts";

const args = process.argv.slice(2);
const lang = args[0];
const hfIdx = args.indexOf("--header-from");
const headerFrom = hfIdx >= 0 ? args[hfIdx + 1] : undefined;
const dry = args.includes("--dry");
if (!lang) {
  console.error("usage: node po_recover.mts <lang> [--header-from <file>] [--dry]");
  process.exit(2);
}
const path = `patches/ai-voice-pack/po/${lang}.po`;
const text = readFileSync(path, "utf-8").replace(/\r\n/g, "\n");

/** Счётчик записей и переводов ПО СОСТОЯНИЮ (не по шапке). */
function stats(t: string): { entries: number; translated: number } {
  const es = parsePo(t).filter((e) => e.msgid);
  return { entries: es.length, translated: es.filter((e) => e.msgstr.trim()).length };
}
const before = stats(text);

const blocks = text.split("\n\n");
const isHeader = (b: string): boolean => /^msgid ""\s*$/m.test(b);
const headerBlock = blocks.find(isHeader) ?? (headerFrom ? readFileSync(headerFrom, "utf-8").split("\n\n")[0] : undefined);
if (!headerBlock || !isHeader(headerBlock)) {
  console.error(`нет здоровой шапки в ${path}${headerFrom ? " и в --header-from" : " (укажи --header-from)"}`);
  process.exit(1);
}
// Записи: блоки с непустым msgid (шапки и мусор шапочного типа отбрасываем).
const entries = blocks.filter((b) => /^msgid ".+"/m.test(b) && !isHeader(b));
const out = `${headerBlock.replace(/\n+$/, "")}\n\n${entries.join("\n\n").replace(/\n+$/, "")}\n`;
const after = stats(out);

console.log(`до: ${before.entries} записей, ${before.translated} переведено`);
console.log(`после: ${after.entries} записей, ${after.translated} переведено`);
console.log(`шапок в выходе: ${(out.match(/^msgid ""\s*$/gm) ?? []).length}`);

if (after.entries !== before.entries || after.translated !== before.translated) {
  console.error("СЧЁТЧИКИ РАЗОШЛИСЬ — ничего не пишу");
  process.exit(1);
}
if (dry) {
  console.log("--dry: не пишу");
  process.exit(0);
}
writePoAtomic(path, out);
console.log(`записано: ${path}`);
