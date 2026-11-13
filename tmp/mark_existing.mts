import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ALL_LANGS,
  markChanged,
  parsePo,
  renderPo,
  writePoAtomic,
  type PoEntry,
} from "../.opencode/skills/renpy-po/po_core.mts";
import { poHeaderLines } from "../.opencode/skills/renpy-po/po_update.mts";

const key = (e: PoEntry): string => `${e.msgctxt}\u0000${e.msgid}`;
for (const lang of ALL_LANGS) {
  const rel = join("patches", "ai-voice-pack", "po", `${lang}.po`);
  let head = "";
  try {
    head = execFileSync("git", ["show", `HEAD:${rel.split("\\").join("/")}`], {
      encoding: "utf-8",
      maxBuffer: 64 << 20,
    });
  } catch {
    continue;
  }
  const before = new Map<string, string>();
  for (const e of parsePo(head.replace(/\r\n/gu, "\n"))) if (e.msgid) before.set(key(e), e.msgstr);

  const text = readFileSync(rel, "utf-8").replace(/\r\n/gu, "\n");
  const all = parsePo(text);
  const entries = all.filter((e) => e.msgid);
  let n = 0;
  for (const e of entries) {
    const old = before.get(key(e));
    if (old !== undefined && old !== e.msgstr && e.msgstr.trim()) {
      markChanged(e);
      n++;
    }
  }
  if (n) writePoAtomic(rel, renderPo(all, poHeaderLines(text)));
  console.log(`${lang}: помечено ${n}`);
}
