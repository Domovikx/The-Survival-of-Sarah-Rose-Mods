import { readFileSync, writeFileSync } from "node:fs";
const j = JSON.parse(readFileSync("tmp/ru_changed.json", "utf-8")) as Array<{ idx: number; en: string }>;
const buckets: Array<[string, (n: number) => boolean]> = [
  ["short", (n) => n < 60],
  ["mid", (n) => n >= 60 && n < 130],
  ["long", (n) => n >= 130],
];
const picked: number[] = [];
for (const [, f] of buckets) {
  const pool = j.filter((r) => f(r.en.length));
  const step = Math.max(1, Math.floor(pool.length / 20));
  picked.push(...pool.filter((_, i) => i % step === 0).slice(0, 20).map((r) => r.idx));
}
writeFileSync("tmp/ab_sample.txt", picked.join("\n"));
console.log(`выбрано ${picked.length}: ${picked.slice(0, 10).join(", ")}...`);
