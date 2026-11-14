import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const m = JSON.parse(readFileSync("site/src/widgets/demo/manifest.json", "utf8"));
const root = "patches/ai-voice-pack/audio/de";
const have = new Set<string>();
const walk = (d: string) => {
  if (!existsSync(d)) return;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const f = join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (e.name.endsWith(".opus")) have.add(e.name.split("__")[0]!);
  }
};
walk(root);
const missing = m.phrases.filter((p: { uid: string }) => !have.has(p.uid));
console.log("в de не сгенерены:");
for (const p of missing) console.log(" -", p.uid.slice(0, 8), p.speaker);
const po = readFileSync("patches/ai-voice-pack/po/de.po", "utf8");
for (const p of missing) {
  const re = new RegExp(`msgid "${p.text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"\\r?\\nmsgstr "((?:[^"\\\\]|\\\\.)*)"`, "m");
  const mm = re.exec(po);
  console.log("po msgstr:", mm ? JSON.stringify(mm[1]!.slice(0, 60)) : "(блок не найден — CRLF?)");
}
