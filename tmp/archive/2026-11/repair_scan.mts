/**
 * Ремонт-скан v2: находит порченые строки со стороны МАРИОНА в po
 * (искажения имени, смешанные алфавиты, женский род при мужском имени),
 * откатывает их к HEAD и снимает из done — переведутся заново с гейтами.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { parsePo, renderPo, writePoAtomic } from "../.opencode/skills/renpy-po/po_core.mts";
import { SPEAKER_GENDER } from "../patches/ai-voice-pack/casts/gender.mts";

const PO = "patches/ai-voice-pack/po/ru.po";
const DONE = "tmp/translate_ru.done";
const MIXED = /([а-яё][a-zA-Z]|[a-zA-Z][а-яё])/;
const NAME_BAD = /Мария|Мариян|Маррион|Марцион/;

const head = execSync("git show HEAD:patches/ai-voice-pack/po/ru.po", { maxBuffer: 64 * 1024 * 1024 }).toString("utf-8");
const headMap = new Map<string, string>();
for (const e of parsePo(head.replace(/\r\n/g, "\n"))) {
  if (e.msgid) headMap.set(`${e.msgctxt}\u0000${e.msgid}`, e.msgstr);
}

const text = readFileSync(PO, "utf-8").replace(/\r\n/g, "\n");
const entries = parsePo(text).filter((e) => e.msgid);
const header = text.split("\n\n")[0].split("\n");

const corrupt = (msgid: string, msgstr: string): string | null => {
  if (NAME_BAD.test(msgstr) || MIXED.test(msgstr)) return "имя/скрипт";
  if (/\bMarion\b/.test(msgid) && SPEAKER_GENDER["Marion"] === "M") {
    const fem = /\bМарион\s+(?:[а-яё]+\s+){0,2}[а-яё]+ла[сь]?\b/.exec(msgstr);
    if (fem) return `женский род: «${fem[0]}»`;
  }
  return null;
};

const idx: number[] = [];
entries.forEach((e, i) => {
  if (e.msgid && corrupt(e.msgid, e.msgstr)) idx.push(i);
});

let restored = 0;
for (const i of idx) {
  const e = entries[i];
  const old = headMap.get(`${e.msgctxt}\u0000${e.msgid}`);
  if (old !== undefined && old !== e.msgstr) { e.msgstr = old; restored++; }
  console.log(`[${i}] ${e.msgid.slice(0, 60)} => ${e.msgstr.slice(0, 70)}`);
}
if (idx.length) writePoAtomic(PO, renderPo(entries, header));

const done = new Set(readFileSync(DONE, "utf-8").split("\n").filter((l) => l.trim()).map(Number));
for (const i of idx) done.delete(i);
if (idx.length) writeFileSync(DONE, [...done].sort((a, b) => a - b).join("\n") + "\n", "utf-8");

console.log(`найдено: ${idx.length}, откат к HEAD: ${restored}, снято из done: ${idx.length}`);
