/** Разовый фикс: заменяет реальные NUL-байты на escape \u0000 в тексте файла. */
import { readFileSync, writeFileSync } from "node:fs";

const p = process.argv[2];
if (!p) throw new Error("укажи путь к файлу");
const buf = readFileSync(p);
const parts: Buffer[] = [];
let start = 0;
let n = 0;
for (let i = 0; i < buf.length; i++) {
  if (buf[i] === 0) {
    parts.push(buf.subarray(start, i));
    parts.push(Buffer.from("\\u0000", "ascii"));
    start = i + 1;
    n++;
  }
}
parts.push(buf.subarray(start));
if (n) writeFileSync(p, Buffer.concat(parts));
const after = readFileSync(p).filter((b) => b === 0).length;
console.log(`заменено NUL: ${n}; осталось: ${after}`);
