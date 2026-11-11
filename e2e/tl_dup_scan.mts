import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const OLD = /^ {4}old "((?:[^"\\]|\\.)*)"/gm;
for (const L of ["ru", "de", "es", "fr", "it", "ja", "ko", "pl", "pt", "zh"]) {
  const seen = new Map<string, string>();
  let dups = 0;
  const samples: string[] = [];
  for (const f of walk("patches/ai-voice-pack/tl/" + L)) {
    const t = readFileSync(f, "utf8");
    for (const m of t.matchAll(OLD)) {
      const k = m[1]!;
      if (seen.has(k)) {
        dups++;
        if (samples.length < 3) samples.push(`${k.slice(0, 40)} @${f.split(/[\\/]/).pop()}`);
      } else seen.set(k, f);
    }
  }
  console.log(`${L}: дублей old: ${dups}${samples.length ? " | " + samples.join(" ;; ") : ""}`);
}
