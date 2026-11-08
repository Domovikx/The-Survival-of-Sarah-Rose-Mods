// tmp/es_diag2.mts — глубокая сверка частей слайса с оригиналом
import { readFileSync } from "node:fs";

const id = process.argv[2] ?? "0010";

function blocksOf(t: string): string[] {
  return t
    .replace(/\r\n/g, "\n")
    .replace(/\n+$/, "")
    .split(/\n\n+/);
}
function unesc(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}
function fv(b: string, f: string): string | null {
  const L = b.split("\n");
  const s = L.findIndex((l) => l.startsWith(`${f} `));
  if (s < 0) return null;
  const P: string[] = [];
  for (let i = s; i < L.length; i++) {
    if (i === s) P.push(L[i].slice(f.length + 1));
    else if (L[i].startsWith('"')) P.push(L[i]);
    else break;
  }
  return unesc([...P.join("").matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]).join(""));
}

const orig = blocksOf(readFileSync(`tmp/es_slices/${id}.po`, "utf8"));
const oMsgids = new Set(orig.map((b) => fv(b, "msgid")));
const parts: string[] = [];
for (const p of ["_1", "_2", "_3"]) {
  try {
    parts.push(...blocksOf(readFileSync(`tmp/es_done/parts/${id}${p}.po`, "utf8")));
  } catch {
    /* нет части */
  }
}
let idHit = 0;
const idMiss: string[] = [];
for (const b of parts) {
  const mid = fv(b, "msgid");
  if (oMsgids.has(mid)) idHit++;
  else idMiss.push(b);
}
console.log(`msgid совпал: ${idHit} из ${parts.length}; msgid НЕ совпал: ${idMiss.length}`);
if (idMiss.length > 0) {
  console.log("=== примеры msgid, которых нет в слайсе:");
  for (const m of idMiss.slice(0, 5)) console.log(`---\nmsgid: ${fv(m, "msgid")?.slice(0, 120)}\nmsgctxt: ${fv(m, "msgctxt")}`);
}
// сколько записей слайса вообще имеет многострочный msgid
const multi = orig.filter((b) => b.split("\n").filter((l) => l.startsWith('"')).length > 1).length;
console.log(`записей слайса с многострочным msgid: ${multi} из ${orig.length}`);
