import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { ALL_LANGS, isChanged, parsePo, type PoEntry } from "../.opencode/skills/renpy-po/po_core.mts";

const key = (e: PoEntry): string => `${e.msgctxt}\u0000${e.msgid}`;
let bad = 0;
for (const lang of ALL_LANGS) {
  const rel = `patches/ai-voice-pack/po/${lang}.po`;
  let headText = "";
  try {
    headText = execFileSync("git", ["show", `HEAD:${rel}`], { encoding: "utf-8", maxBuffer: 64 << 20 });
  } catch {
    continue;
  }
  const before = new Map<string, string>();
  for (const e of parsePo(headText.replace(/\r\n/gu, "\n"))) if (e.msgid) before.set(key(e), e.msgstr);
  const cur = parsePo(readFileSync(rel, "utf-8").replace(/\r\n/gu, "\n")).filter((e) => e.msgid);

  const taggedButSame: number[] = [];
  const changedButUntagged: number[] = [];
  let tagged = 0;
  for (let i = 0; i < cur.length; i++) {
    const e = cur[i]!;
    const old = before.get(key(e));
    const changed = old !== undefined && old !== e.msgstr;
    const tag = isChanged(e);
    if (tag) tagged++;
    if (tag && !changed) taggedButSame.push(i);
    if (changed && !tag) changedButUntagged.push(i);
  }
  const ok = !taggedButSame.length && !changedButUntagged.length;
  if (!ok) bad++;
  console.log(
    `${lang}: якорей ${tagged} | ${ok ? "ОК" : "ПРОБЛЕМА"}` +
      (taggedButSame.length ? ` | якорь на неизменённой: ${taggedButSame.slice(0, 5).join(",")}` : "") +
      (changedButUntagged.length ? ` | изменено без якоря: ${changedButUntagged.slice(0, 5).join(",")}` : ""),
  );
}
console.log(bad ? `\nПРОБЛЕМНЫХ ЯЗЫКОВ: ${bad}` : "\nвсе якоря совпадают с фактическими изменениями");
