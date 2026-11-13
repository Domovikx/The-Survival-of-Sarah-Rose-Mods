import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const REG = new Set(["vulgar", "slang", "colloquial", "childish", "derogatory", "euphemistic", "offensive", "informal"]);
const TOP = new Set(["sexuality", "sex", "anatomy", "pornography", "bdsm", "prostitution", "lgbt", "physiology"]);
const strip = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");

const rl = createInterface({ input: createReadStream(process.argv[2]!, "utf-8"), crlfDelay: Infinity });
let total = 0, reg = 0, sex = 0;
const examples: string[] = [];
for await (const line of rl) {
  total++;
  let e: any;
  try {
    e = JSON.parse(line);
  } catch {
    continue;
  }
  const senses: any[] = e.senses ?? [];
  const tags = new Set<string>(senses.flatMap((s) => s.tags ?? []));
  const topics = new Set<string>(senses.flatMap((s) => s.topics ?? []));
  const hasReg = [...tags].some((t) => REG.has(t));
  const hasSex = [...topics].some((t) => TOP.has(t));
  if (hasReg) reg++;
  if (hasSex) sex++;
  if ((hasReg || hasSex) && examples.length < 12) {
    const s = senses.find((x) => [...(x.tags ?? []), ...(x.topics ?? [])].some((t) => REG.has(t) || TOP.has(t)));
    examples.push(
      `${strip(e.word)} [${e.pos}] tags={${[...tags].join(",")}} topics={${[...topics].join(",")}} :: ${(s?.glosses ?? []).join(" | ").slice(0, 80)}`,
    );
  }
}
console.log(`строк: ${total} | с тегом регистра: ${reg} | с секс-темой: ${sex}`);
for (const ex of examples) console.log("  " + ex);
