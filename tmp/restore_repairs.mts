/**
 * Откат правок текущего прогона: строки со статусом repaired возвращаются к
 * тексту ДО правки (old из журнала), чтобы пересудить их НОВЫМ стандартом
 * (правила 2026-11-03: калька/усиление действий/род нарратора).
 * Затем журнал уходит в архив — прогон начинается с нуля.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { parsePo, renderPo, writePoAtomic } from "../.opencode/skills/renpy-po/po_core.mts";

const LANG = process.argv[2] ?? "ru";
const poPath = `patches/ai-voice-pack/po/${LANG}.po`;
const jsonlPath = `tmp/po_repair_full_${LANG}.jsonl`;

interface Row {
  msgid?: string;
  repaired?: boolean;
  old?: string;
  new?: string;
}

const fixes = readFileSync(jsonlPath, "utf-8")
  .split("\n")
  .flatMap<Row>((l) => {
    if (!l.trim()) return [];
    try {
      const j = JSON.parse(l) as Row;
      return j.repaired && j.msgid && j.old ? [j] : [];
    } catch {
      return [];
    }
  });
console.log(`правок в журнале: ${fixes.length}`);

const text = readFileSync(poPath, "utf-8").replace(/\r\n/g, "\n");
const entries = parsePo(text);
const byMsgid = new Map<string, typeof entries>();
for (const e of entries) {
  if (!e.msgid) continue;
  const list = byMsgid.get(e.msgid) ?? [];
  list.push(e);
  byMsgid.set(e.msgid, list);
}

let reverted = 0;
let skippedAmbiguous = 0;
let skippedChanged = 0;
for (const f of fixes) {
  const list = byMsgid.get(f.msgid!) ?? [];
  if (list.length !== 1) {
    skippedAmbiguous++;
    continue;
  }
  const e = list[0];
  // Не трогаем чужую/ручную правку: откатываем только свой текст (new).
  if (f.new && e.msgstr !== f.new) {
    skippedChanged++;
    continue;
  }
  e.msgstr = f.old!;
  reverted++;
}

writePoAtomic(poPath, renderPo(entries, text.split("\n\n")[0].split("\n")));
console.log(`откатано ${reverted} | неоднозначных (msgid не один) ${skippedAmbiguous} | чужих правок ${skippedChanged}`);
if (skippedAmbiguous) {
  const sample = fixes
    .filter((f) => (byMsgid.get(f.msgid!) ?? []).length !== 1)
    .slice(0, 10)
    .map((f) => `«${f.msgid!.slice(0, 60)}»`);
  console.log("неоднозначные (посмотреть руками):");
  for (const s of sample) console.log("   ", s);
}
writeFileSync(`tmp/restore_${LANG}_report.txt`, fixes.map((f) => f.msgid).join("\n"), "utf-8");
