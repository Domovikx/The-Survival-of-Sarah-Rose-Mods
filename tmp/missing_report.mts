import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

const LANGS = ["ru", "de", "es", "fr", "it", "pl", "pt", "ko", "zh", "ja"];
const pot = parsePo(readFileSync("patches/ai-voice-pack/po/template.pot", "utf-8").replace(/\r\n/gu, "\n")).filter((e) => e.msgid);
const byUid = new Map<string, { ctxt: string; en: string }>();
for (const e of pot) byUid.set(createHash("md5").update(e.msgid, "utf8").digest("hex"), { ctxt: e.msgctxt, en: e.msgid });

const missingAll: Array<{ lang: string; uid: string }> = [];
for (const lang of LANGS) {
  const uids = readFileSync(`tmp/uids_${lang}.txt`, "utf-8").split(/\s+/u).filter(Boolean);
  const root = join("patches", "ai-voice-pack", "audio", lang);
  const have = new Set<string>();
  const walk = (d: string): void => {
    for (const x of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, x.name);
      if (x.isDirectory()) walk(p);
      else if (x.name.endsWith(".opus")) have.add(x.name.split("__")[0]!);
    }
  };
  walk(root);
  for (const u of uids) if (!have.has(u)) missingAll.push({ lang, uid: u });
}
for (const m of missingAll) {
  const info = byUid.get(m.uid);
  console.log(`${m.lang} | ${m.uid.slice(0, 8)} | ${info?.ctxt ?? "??"} | ${(info?.en ?? "").slice(0, 70)}`);
}
console.log(`всего пропущено: ${missingAll.length}`);
