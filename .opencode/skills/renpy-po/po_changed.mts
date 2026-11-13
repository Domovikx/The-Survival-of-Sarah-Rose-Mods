/**
 * po_changed.mts — работа с временными якорями `# changed` в po/<lang>.po.
 *
 * Зачем: когда перевод строки меняется (руками или tone_native/po_fix),
 * ставится `# changed`. Владелец ревьюит по этому якорю, затем по uid
 * (md5 EN-текста) переозвучивает именно эти реплики, после чего якоря снимаются.
 *
 * Запуск (из корня репы):
 *   node .opencode/skills/renpy-po/po_changed.mts --lang ru        # список
 *   node .opencode/skills/renpy-po/po_changed.mts --lang all       # все языки
 *   node .opencode/skills/renpy-po/po_changed.mts --lang ru --uids # только uid
 *   node .opencode/skills/renpy-po/po_changed.mts --lang ru --clear  # снять якоря
 *   ... --json                                                     # для скриптов
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ALL_LANGS, clearChanged, isChanged, parsePo, renderPo, writePoAtomic } from "./po_core.mts";
import { poHeaderLines } from "./po_update.mts";

interface Args {
  langs: string[];
  clear: boolean;
  uids: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { langs: [], clear: false, uids: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s === "--lang") a.langs = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (s === "--clear") a.clear = true;
    else if (s === "--uids") a.uids = true;
    else if (s === "--json") a.json = true;
  }
  if (!a.langs.length || a.langs.includes("all")) a.langs = [...ALL_LANGS];
  const bad = a.langs.filter((l) => !ALL_LANGS.includes(l));
  if (bad.length) throw new Error(`неизвестный язык: ${bad.join(", ")} (есть: ${ALL_LANGS.join(", ")})`);
  return a;
}

const uid = (msgid: string): string => createHash("md5").update(msgid, "utf8").digest("hex");

const args = parseArgs(process.argv.slice(2));
const rows: Array<{ lang: string; idx: number; uid: string; ctxt: string; en: string; tr: string }> = [];

for (const lang of args.langs) {
  const path = join("patches", "ai-voice-pack", "po", `${lang}.po`);
  const text = readFileSync(path, "utf-8").replace(/\r\n/gu, "\n");
  const entries = parsePo(text).filter((e) => e.msgid);
  let touched = false;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (!isChanged(e)) continue;
    rows.push({ lang, idx: i, uid: uid(e.msgid), ctxt: e.msgctxt, en: e.msgid, tr: e.msgstr });
    if (args.clear) {
      clearChanged(e);
      touched = true;
    }
  }
  if (args.clear && touched) writePoAtomic(path, renderPo(entries, poHeaderLines(text)));
}

if (args.uids) {
  const out = rows.map((r) => r.uid);
  process.stdout.write(`${out.join("\n")}${out.length ? "\n" : ""}`);
} else if (args.json) {
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
} else {
  let cur = "";
  for (const r of rows) {
    if (r.lang !== cur) {
      cur = r.lang;
      console.log(`\n===== ${r.lang}`);
    }
    console.log(`[${r.idx}] ${r.ctxt}  uid=${r.uid}`);
    console.log(`  EN: ${r.en.replace(/\n/gu, " ⏎ ")}`);
    console.log(`  TR: ${r.tr.replace(/\n/gu, " ⏎ ")}`);
  }
  console.log(`\nитог: якорей ${rows.length}${args.clear ? " (сняты)" : ""}`);
}
