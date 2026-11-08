/**
 * Разовый отчёт (tmp/, gitignored): топ-12 спикеров TSSR — объём реплик,
 * покрытие перевода tl/ru, наличие каста в registry/casts.
 * Запуск: node tmp/speaker_stats.mts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { scanGame } from "../.opencode/skills/renpy-po/potgen.mts";

const REPO = "C:/Users/Domo/workspace/The-Survival-of-Sarah-Rose-Mods";
const GAME =
  "C:/Program Files (x86)/Steam/steamapps/common/The Survival of Sarah Rose/game";
const TL = join(REPO, "patches/ai-voice-pack/tl/ru");
const CASTS = join(REPO, "patches/ai-voice-pack/registry/casts");

// 1. Диалоговые записи POT по спикерам.
const catalog = scanGame(GAME);
const perSpeaker = new Map<string, Set<string>>();
for (const e of catalog.entries.values()) {
  if (!e.msgctxt.startsWith("speaker:")) continue;
  const sp = e.msgctxt.slice("speaker:".length);
  if (!perSpeaker.has(sp)) perSpeaker.set(sp, new Set());
  perSpeaker.get(sp)!.add(e.msgid);
}

// 2. Корпус tl/ru: old -> new (непустой new != old = переведено).
const tl = new Map<string, string>();
function walkTl(dir: string): void {
  let dirents;
  try {
    dirents = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of dirents) {
    const full = join(dir, d.name);
    if (d.isDirectory()) walkTl(full);
    else if (d.name.endsWith(".rpy")) {
      const lines = readFileSync(full, "utf-8").split("\n");
      let old: string | null = null;
      for (const line of lines) {
        const s = line.trim();
        let m = /^old\s+"((?:[^"\\]|\\.)*)"\s*$/.exec(s);
        if (m) {
          old = m[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
          continue;
        }
        m = /^new\s+"((?:[^"\\]|\\.)*)"\s*$/.exec(s);
        if (m && old !== null) {
          const n = m[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
          if (n && n !== old && !tl.has(old)) tl.set(old, n);
          old = null;
        }
      }
    }
  }
}
walkTl(TL);

// 3. Наличие каста = папка registry/casts/<Имя>.
const casts = new Set(readdirSync(CASTS));

// 4. Все спикеры с >= 80 уникальными репликами.
const rows = [...perSpeaker]
  .map(([sp, set]) => {
    let translated = 0;
    for (const t of set) {
      const n = tl.get(t);
      if (n && n !== t) translated++;
    }
    return { sp, total: set.size, translated, pct: Math.round((100 * translated) / set.size) };
  })
  .filter((r) => r.total >= 80)
  .sort((a, b) => b.total - a.total);

let totAll = 0;
let trAll = 0;
for (const set of perSpeaker.values()) {
  totAll += set.size;
  for (const t of set) {
    const n = tl.get(t);
    if (n && n !== t) trAll++;
  }
}
console.log(`ИТОГО: уникальных реплик ${totAll}, переведено ${trAll} (${Math.round((100 * trAll) / totAll)}%)`);
console.log("спикер | уникальных реплик | переведено ru | % | каст (голос)");
for (const r of rows) {
  console.log(
    `${r.sp} | ${r.total} | ${r.translated} | ${r.pct}% | ${casts.has(r.sp) ? "ЕСТЬ" : "—"}`,
  );
}
