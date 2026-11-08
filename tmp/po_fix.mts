/**
 * tmp/po_fix.mts — ремонт es.po после битых прогонов + сверка целостности с POT.
 *
 * - восстанавливает потерянные msgctxt (из template.pot, позиционная сверка);
 * - восстанавливает msgid, испорченные правками (сверка байт-в-байт с POT);
 * - отчёт: счётчики записей, расхождения.
 *
 * ЗАПУСК: node tmp/po_fix.mts [--apply]   (без --apply — только отчёт)
 */
import { readFileSync, writeFileSync } from "node:fs";

const PO = "patches/ai-voice-pack/po/es.po";
const POT = "patches/ai-voice-pack/po/template.pot";
const apply = process.argv.includes("--apply");

interface Block {
  raw: string;
  ctx: string | null;
  mid: string;
  mstr: string | null;
  emo: string | null;
}

function parseBlocks(path: string): Block[] {
  const text = readFileSync(path, "utf-8");
  const chunks = text.split(/\r?\n\r?\n/);
  return chunks.map((raw) => {
    const lines = raw.split(/\r?\n/);
    let ctx: string | null = null;
    let mid: string | null = null;
    let mstr: string | null = null;
    let emo: string | null = null;
    for (const l of lines) {
      if (l.startsWith("#. emotion:")) emo = l.slice(11).trim();
      else if (l.startsWith("msgctxt ")) ctx = l;
      else if (l.startsWith("msgid ")) mid = l.slice(6);
      else if (l.startsWith("msgstr ")) mstr = l.slice(7);
    }
    return { raw, ctx, mid: mid ?? "", mstr, emo };
  });
}

const es = parseBlocks(PO);
const pot = parseBlocks(POT);

const esEntries = es.filter((b) => b.mid !== "");
const potEntries = pot.filter((b) => b.mid !== "");

console.log(`es.po записей: ${esEntries.length}, pot записей: ${potEntries.length}`);
if (esEntries.length !== potEntries.length) {
  console.log("СЧЁТ НЕ СОВПАДАЕТ — позиционная сверка невозможна, выхожу.");
  process.exit(1);
}

let fixedCtx = 0;
let fixedMid = 0;
let midMismatches: string[] = [];
const outBlocks: string[] = [];
let ei = 0;
for (let i = 0; i < es.length; i++) {
  const b = es[i];
  if (b.mid === "") {
    outBlocks.push(b.raw);
    continue;
  }
  const p = potEntries[ei];
  ei++;
  let raw = b.raw;
  // 1) восстановление msgctxt
  if (!b.ctx && p.ctx) {
    const lines = raw.split(/\r?\n/);
    const mi = lines.findIndex((l) => l.startsWith("msgid "));
    lines.splice(mi, 0, p.ctx);
    raw = lines.join("\n");
    fixedCtx++;
  }
  // 2) сверка msgid
  const bMid = esEntries[ei - 1].mid;
  if (p.mid !== bMid) {
    midMismatches.push(`  es L${i + 1}: ${bMid.slice(0, 90)}\n  pot     : ${p.mid.slice(0, 90)}`);
    // msgid должен совпадать с игрой (ключ перевода) — берём POT
    const lines = raw.split(/\r?\n/);
    const mi = lines.findIndex((l) => l.startsWith("msgid "));
    lines[mi] = "msgid " + p.mid;
    // если в блоке были продолжения многострочного msgid — сверяем длину
    raw = lines.join("\n");
    fixedMid++;
  }
  outBlocks.push(raw);
}

console.log(`восстановлено msgctxt: ${fixedCtx}`);
console.log(`восстановлено msgid: ${fixedMid}`);
if (midMismatches.length) console.log("расхождения msgid:\n" + midMismatches.join("\n"));

if (apply && (fixedCtx || fixedMid)) {
  writeFileSync(PO, outBlocks.join("\n\n"), "utf-8");
  console.log(`ЗАПИСАНО: ${PO}`);
} else {
  console.log(apply ? "изменений не было — файл не тронут" : "dry-run (без --apply)");
}
