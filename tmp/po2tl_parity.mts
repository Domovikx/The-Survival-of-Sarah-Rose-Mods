/**
 * Разовый паритет: po2tl ru vs шиппенный tl/ru (E2E-проверка конвертера).
 * node tmp/po2tl_parity.mts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const OLD_RE = /^ {4}old "((?:[^"\\]|\\.)*)"/m;
const NEW_RE = /^ {4}new "((?:[^"\\]|\\.)*)"/m;

const pairs = (dir: string): Map<string, string> => {
  const m = new Map<string, string>();
  for (const f of walk(dir)) {
    const t = readFileSync(f, "utf-8");
    for (const b of t.split(/\n\n(?= {4}old )/)) {
      const o = OLD_RE.exec(b)?.[1];
      const w = NEW_RE.exec(b)?.[1];
      if (o !== undefined && w !== undefined) m.set(o, w);
    }
  }
  return m;
};

const gen = pairs("tmp/tl_ru_parity");
const ship = pairs("patches/ai-voice-pack/tl/ru");
let same = 0;
let diff = 0;
const diffEx: string[] = [];
for (const [o, w] of gen) {
  if (!ship.has(o)) continue;
  if (ship.get(o) === w) same++;
  else {
    diff++;
    if (diffEx.length < 6) diffEx.push(`OLD: ${o.slice(0, 60)} | ship: ${(ship.get(o) ?? "").slice(0, 45)} | gen: ${w.slice(0, 45)}`);
  }
}
const onlyGen = [...gen.keys()].filter((k) => !ship.has(k)).length;
const onlyShip = [...ship.keys()].filter((k) => !gen.has(k)).length;
console.log(`генерировано пар: ${gen.size} | в шиппенном: ${ship.size}`);
console.log(`совпали: ${same} | различаются: ${diff} | только в генер: ${onlyGen} | только в шиппенном: ${onlyShip}`);
console.log(diffEx.join("\n"));
// примеры «только в шиппенном»
const onlyShipEx = [...ship.keys()].filter((k) => !gen.has(k)).slice(0, 5);
for (const k of onlyShipEx) console.log("ship-only:", k.slice(0, 80));
