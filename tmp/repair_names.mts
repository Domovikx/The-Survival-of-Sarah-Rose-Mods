/** Ремонт порченых строк: msgstr <- git HEAD + снять индекса из done (переводятся заново). */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { parsePo, renderPo, writePoAtomic } from "../.opencode/skills/renpy-po/po_core.mts";

const PO = "patches/ai-voice-pack/po/ru.po";
const DONE = "tmp/translate_ru.done";

const head = execSync("git show HEAD:patches/ai-voice-pack/po/ru.po", { maxBuffer: 64 * 1024 * 1024 }).toString("utf-8");
const headMap = new Map<string, string>();
for (const e of parsePo(head.replace(/\r\n/g, "\n"))) {
  if (e.msgid) headMap.set(`${e.msgctxt}\u0000${e.msgid}`, e.msgstr);
}

const idx = readFileSync("tmp/repair_list.txt", "utf-8")
  .split("\n")
  .map((l) => /^\[изменено (\d+)\]/.exec(l)?.[1])
  .filter((x): x is string => Boolean(x))
  .map(Number);
// --keep: восстановить HEAD, но НЕ снимать из done — для семантических багов,
// где HEAD правильный, а повторный перевод (temp0) воспроизведёт тот же брак.
const KEEP = process.argv.includes("--keep");

const text = readFileSync(PO, "utf-8").replace(/\r\n/g, "\n");
const entries = parsePo(text).filter((e) => e.msgid);
const header = text.split("\n\n")[0].split("\n");

let restored = 0;
for (const i of idx) {
  const e = entries[i];
  if (!e) { console.log(`нет индекса ${i}`); continue; }
  const old = headMap.get(`${e.msgctxt}\u0000${e.msgid}`);
  if (old !== undefined && old !== e.msgstr) { e.msgstr = old; restored++; }
}
writePoAtomic(PO, renderPo(entries, header));

const done = new Set(
  readFileSync(DONE, "utf-8").split("\n").filter((l) => l.trim()).map(Number),
);
if (!KEEP) for (const i of idx) done.delete(i);
writeFileSync(DONE, [...done].sort((a, b) => a - b).join("\n") + "\n", "utf-8");

console.log(`восстановлено из HEAD: ${restored}/${idx.length}; снято из done: ${KEEP ? 0 : idx.length}${KEEP ? " (--keep)" : ""}`);
