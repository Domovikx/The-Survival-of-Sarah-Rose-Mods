import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const want = new Set([
  "d1f430f16c0bdc526628228d2887494f",
  "a3d758605c5548fdfbdbde06bde0672e",
  "e8f909e94c0dd999d8c089815fd4c5cd",
]);
const e = parsePo(readFileSync("patches/ai-voice-pack/po/template.pot", "utf-8").replace(/\r\n/gu, "\n")).filter((x) => x.msgid);
for (const x of e) {
  const uid = createHash("md5").update(x.msgid, "utf8").digest("hex");
  if (want.has(uid)) {
    console.log(`${uid.slice(0, 8)} | ${x.msgctxt} | ${x.msgid.slice(0, 80)}`);
  }
}
