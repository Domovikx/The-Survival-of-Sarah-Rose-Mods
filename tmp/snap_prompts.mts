import { writeFileSync } from "node:fs";
const t = await import("../.opencode/skills/renpy-po/po_translate.mts");
const out: string[] = [];
for (const l of ["de","es","fr","it","ja","ko","pl","pt","ru","zh"]) {
  out.push("==== " + l + " ====");
  out.push(t.systemPrompt(l));
}
writeFileSync(process.argv[2], out.join("\n"), "utf-8");
console.log("снимок ->", process.argv[2]);
