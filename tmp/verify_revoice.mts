/**
 * verify_revoice.mts — проверка, что для каждого якорного uid появился opus.
 * node tmp/verify_revoice.mts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LANGS = ["ru", "de", "es", "fr", "it", "pl", "pt", "ko", "zh", "ja"];
let missingTotal = 0;
let foundTotal = 0;

for (const lang of LANGS) {
  let uids: string[] = [];
  try {
    uids = readFileSync(`tmp/uids_${lang}.txt`, "utf-8")
      .split(/\s+/u)
      .filter(Boolean);
  } catch {
    continue;
  }
  if (!uids.length) continue;
  const root = join("patches", "ai-voice-pack", "audio", lang);
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else if (d.name.endsWith(".opus")) files.push(d.name);
    }
  };
  walk(root);
  const have = new Set(files.map((f) => f.split("__")[0]!));
  const missing = uids.filter((u) => !have.has(u));
  foundTotal += uids.length - missing.length;
  missingTotal += missing.length;
  console.log(`${lang}: uid ${uids.length}, найдено ${uids.length - missing.length}, нет ${missing.length}`);
  if (missing.length) console.log(`  нет: ${missing.slice(0, 8).join(" ")}`);
}
console.log(`\nитого: найдено ${foundTotal}, нет ${missingTotal}`);
process.exit(missingTotal ? 1 : 0);
