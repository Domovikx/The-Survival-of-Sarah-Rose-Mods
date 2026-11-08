// tmp/es_diag.mts — диагностика частей слайса против оригинала
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

const orig = blocksOf(readFileSync(`tmp/es_slices/${id}.po`, "utf8")).slice(1);
const oKeys = new Set(orig.map((b) => `${fv(b, "msgctxt") ?? ""}|${fv(b, "msgid")}`));
const parts: string[] = [];
for (const p of ["_1", "_2", "_3"]) {
  try {
    parts.push(...blocksOf(readFileSync(`tmp/es_done/parts/${id}${p}.po`, "utf8")));
  } catch {
    /* нет части */
  }
}
let hit = 0;
const miss: string[] = [];
for (const b of parts) {
  const k = `${fv(b, "msgctxt") ?? ""}|${fv(b, "msgid")}`;
  if (oKeys.has(k)) hit++;
  else miss.push(b);
}
console.log(`совпало ключей: ${hit} из ${parts.length}; не совпало: ${miss.length}`);
if (miss.length > 0) {
  console.log("примеры несовпадений:");
  for (const m of miss.slice(0, 3)) console.log(`---\n${m.slice(0, 400)}`);
}
