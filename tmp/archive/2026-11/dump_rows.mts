import { readFileSync, existsSync } from "node:fs";
for (const lang of ["es", "it", "pl", "pt", "ko", "zh", "ja"]) {
  const p = `tmp/native_${lang}.json`;
  if (!existsSync(p)) { console.log(lang, "нет файла"); continue; }
  const j = JSON.parse(readFileSync(p, "utf-8"));
  for (const r of j.rows) console.log(`\n[${lang} ${r.idx}] gates=${JSON.stringify(r.gates)}\n${r.neu}`);
}
