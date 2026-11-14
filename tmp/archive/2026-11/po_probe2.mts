import { readFileSync } from "node:fs";
const m = JSON.parse(readFileSync("site/src/widgets/demo/manifest.json", "utf8"));
const po = readFileSync("patches/ai-voice-pack/po/de.po", "utf8");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
for (const [i, p] of m.phrases.entries()) {
  const id = `msgid "${esc(p.text)}"`;
  const re = new RegExp(`(${id}\\n)msgstr ""`, "m");
  console.log(i + 1, p.speaker, "| msgid есть:", po.includes(id), "| пустой:", re.test(po));
}
