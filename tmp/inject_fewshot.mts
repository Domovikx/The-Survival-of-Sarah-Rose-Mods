// Внедрение few-shot примеров в po_langs/<lang>.mts из tmp/fewshot_pool.json
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = ".opencode/skills/renpy-po/po_langs";
const pool = JSON.parse(readFileSync("tmp/fewshot_pool.json", "utf-8")) as Record<
  string,
  Array<{ en: string; tr: string }>
>;

let changed = 0;
for (const [lang, picks] of Object.entries(pool)) {
  if (!picks.length) continue;
  const f = join(DIR, `${lang}.mts`);
  let src = readFileSync(f, "utf-8");
  if (!src.includes("fewshot: [],")) {
    console.log(`${lang}: пропущен (нет пустого fewshot)`);
    continue;
  }
  const lines = picks.map((p) => `    [${JSON.stringify(p.en)}, ${JSON.stringify(p.tr)}],`);
  const block = `  fewshot: [
${lines.join("\n")}
  ],`;
  src = src.replace("  fewshot: [],", block);
  writeFileSync(f, src, "utf-8");
  changed++;
  console.log(`${lang}: внедрено ${picks.length} примеров`);
}
console.log("изменено файлов:", changed);
