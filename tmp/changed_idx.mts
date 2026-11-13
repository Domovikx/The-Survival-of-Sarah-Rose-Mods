import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const P = "patches/ai-voice-pack/po/ru.po";
const cur = parsePo(readFileSync(P, "utf-8")).filter((e) => e.msgid);
const head = parsePo(execSync(`git show HEAD:${P}`, { maxBuffer: 1e9 }).toString()).filter((e) => e.msgid);
const idx: number[] = [];
for (let i = 0; i < cur.length; i++) {
  if (head[i]!.msgid !== cur[i]!.msgid) throw new Error(`сдвиг записей на ${i}`);
  if (head[i]!.msgstr !== cur[i]!.msgstr) idx.push(i);
}
writeFileSync("tmp/ru_changed_idx.txt", idx.join("\n") + "\n");
console.log("изменённых записей:", idx.length);
