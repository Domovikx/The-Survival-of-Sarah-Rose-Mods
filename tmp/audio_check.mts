import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const j = JSON.parse(readFileSync("tmp/ru_changed.json", "utf-8")) as Array<{ idx: number; uid: string; en: string; tr: string }>;
const files = new Map<string, string>();
const walk = (d: string): void => {
  for (const x of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, x.name);
    if (x.isDirectory()) walk(p);
    else if (x.name.endsWith(".opus")) files.set(x.name.split("__")[0]!, p);
  }
};
walk("patches/ai-voice-pack/audio/ru");
let trackedSame = 0, trackedDiff = 0, untracked = 0;
const same: typeof j = [];
for (const r of j) {
  const p = files.get(r.uid);
  if (!p) continue;
  let isTracked = true;
  try { execFileSync("git", ["ls-files", "--error-unmatch", p], { stdio: "ignore" }); } catch { isTracked = false; }
  if (!isTracked) { untracked++; continue; }
  let changed = true;
  try { execFileSync("git", ["diff", "--quiet", "--", p]); changed = false; } catch { changed = true; }
  if (changed) trackedDiff++; else { trackedSame++; same.push(r); }
}
console.log({ trackedSame, trackedDiff, untracked });
for (const r of same.slice(0, 5)) console.log(`\n[${r.idx}] ${r.en.slice(0, 70)}\nRU: ${r.tr.slice(0, 90)}`);
