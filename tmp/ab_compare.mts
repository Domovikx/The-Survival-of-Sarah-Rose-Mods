/**
 * ab_compare.mts — сравнение двух прогонов tone_native (Q4 vs Q8) по одному списку.
 * node tmp/ab_compare.mts tmp/ab_q4.log tmp/ab_q8.log
 */
import { readFileSync } from "node:fs";

interface Row {
  idx: number;
  neu: string;
  back: string;
  f1?: number;
  gates: string[];
}

function parseLog(path: string): Map<number, Row> {
  const text = readFileSync(path, "utf-8");
  const out = new Map<number, Row>();
  const blocks = text.split(/^### /gmu).slice(1);
  for (const b of blocks) {
    const head = /^\[(\d+)\/(\d+)\] idx (\d+) (ок|гейт|✗)(?: f1=([\d.]+))?/u.exec(b);
    if (!head) continue;
    const idx = Number(head[3]);
    const neu = /^  стало: (.*)$/mu.exec(b)?.[1] ?? "";
    const back = /^  обратно: (.*)$/mu.exec(b)?.[1] ?? "";
    const gates = /^  гейт: (.*)$/mu.exec(b)?.[1] ?? "";
    out.set(idx, { idx, neu, back, f1: head[5] ? Number(head[5]) : undefined, gates: gates ? gates.split("; ") : [] });
  }
  return out;
}

const [aPath, bPath] = process.argv.slice(2);
const A = parseLog(aPath!);
const B = parseLog(bPath!);
const idxs = [...A.keys()].filter((i) => B.has(i));
let same = 0;
let sumA = 0;
let sumB = 0;
const rows: Array<{ idx: number; a: Row; b: Row }> = [];
for (const i of idxs) {
  const a = A.get(i)!;
  const b = B.get(i)!;
  if (a.neu === b.neu) same++;
  if (a.f1 !== undefined) sumA += a.f1;
  if (b.f1 !== undefined) sumB += b.f1;
  rows.push({ idx: i, a, b });
}
const n = rows.length || 1;
console.log(`строк: ${rows.length} | идентичных переводов: ${same} | средний F1: A=${(sumA / n).toFixed(3)} B=${(sumB / n).toFixed(3)}`);
console.log(`флагов гейта: A=${rows.filter((r) => r.a.gates.length).length} B=${rows.filter((r) => r.b.gates.length).length}`);
for (const r of rows) {
  if (r.a.neu === r.b.neu) continue;
  console.log(`\n[${r.idx}] f1 A=${r.a.f1 ?? "-"} B=${r.b.f1 ?? "-"}`);
  console.log(`A: ${r.a.neu}`);
  console.log(`B: ${r.b.neu}`);
  if (r.a.gates.length || r.b.gates.length) console.log(`гейты: A=${r.a.gates.join("; ") || "-"} | B=${r.b.gates.join("; ") || "-"}`);
}
