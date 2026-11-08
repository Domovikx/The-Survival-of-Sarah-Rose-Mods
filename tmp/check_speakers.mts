/**
 * Одноразовая проверка (tmp): покрывает ли SPEAKERS из casts.mts всех
 * dialogue-спикеров каталога voices.jsonl (гейт выбора резолва в voice_batch.mts).
 */
import { readFileSync } from "node:fs";

const txt = readFileSync("patches/ai-voice-pack/casts/casts.mts", "utf8");
const block = txt.match(/export const SPEAKERS[^{]*{([\s\S]*?)\n};/)[1];
const keys = new Set(
  [...block.matchAll(/^\s*"((?:[^"\\]|\\.)*)":/gm)].map((m) =>
    m[1].replace(/\\(.)/g, (_x, c) => (c === "n" ? "\n" : c)),
  ),
);
console.log("ключей SPEAKERS:", keys.size);

const lines = readFileSync("patches/ai-voice-pack/catalog/voices.jsonl", "utf8")
  .split("\n")
  .slice(1)
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const miss = new Map();
let total = 0;
for (const e of lines) {
  if (e.category !== "dialogue") continue;
  total++;
  const n = e.who_name || "Narrator";
  if (!keys.has(n)) miss.set(n, (miss.get(n) || 0) + 1);
}
console.log("dialogue-записей всего:", total);
console.log("без SPEAKERS-ключа:", [...miss.values()].reduce((a, b) => a + b, 0));
console.log("уникальных отсутствующих:", miss.size);
console.log([...miss.entries()].slice(0, 15));
