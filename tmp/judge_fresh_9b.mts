/**
 * tmp/judge_fresh_9b.mts — одноразовая проверка качества СВЕЖИХ 9B-переводов
 * (tmp/de_ab_9b.json) независимым судьёй --fast на том же 9B.
 * KISS: переиспользует judge() из po_translate.mts, ничего не пишет в po.
 * Запуск: node tmp/judge_fresh_9b.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { judge } from "../.opencode/skills/renpy-po/po_translate.mts";
import { potIndex } from "../.opencode/skills/renpy-po/pot_resolve.mts";
import { resolveBackend } from "../scripts/llm_backend.mts";

const REPO = process.cwd();
const fresh = JSON.parse(readFileSync(join(REPO, "tmp", "de_ab_9b.json"), "utf8")) as Array<{
  ctx: string;
  msgid: string;
  msgstr: string;
}>;
const poText = readFileSync(join(REPO, "patches", "ai-voice-pack", "po", "de.po"), "utf8").replace(/\r\n/g, "\n");
const entries = parsePo(poText).filter((e) => e.msgid);
const byKey = new Map(entries.map((e) => [`${e.msgctxt}\u0000${e.msgid}`, e]));
const backend = resolveBackend();
const pot = potIndex();

console.log(`судья: ${backend.model} @ ${backend.url} | строк: ${fresh.length}`);

// 8 параллельных воркеров (LM Studio parallel=8)
const results: Array<{ score: number; issues: string[]; msgid: string }> = [];
let cursor = 0;
const t0 = Date.now();
const worker = async (): Promise<void> => {
  for (;;) {
    const i = cursor++;
    if (i >= fresh.length) return;
    const f = fresh[i];
    const entry = byKey.get(`${f.ctx}\u0000${f.msgid}`);
    if (!entry) {
      console.log(`  ПРОПУСК (нет в po): ${f.msgid.slice(0, 50)}`);
      continue;
    }
    // убеждаемся, что msgstr в po действительно свежий
    const v = await judge(
      backend.url,
      backend.model,
      "de",
      entry,
      f.msgstr,
      pot.emotion(entry.msgctxt, entry.msgid),
      "",
    );
    results.push({ score: v.score, issues: v.issues, msgid: f.msgid });
    const done = results.length;
    if (done % 20 === 0) console.log(`  [${done}/${fresh.length}] ${(Date.now() - t0) / 1000 / done < 10 ? ((Date.now() - t0) / 1000 / done).toFixed(1) : "?"} с/стр`);
  }
};
await Promise.all(Array.from({ length: 8 }, () => worker()));

const sec = (Date.now() - t0) / 1000;
const hist: Record<number, number> = {};
for (const r of results) hist[r.score] = (hist[r.score] ?? 0) + 1;
const below = results.filter((r) => r.score < 9);
console.log(`\nИТОГО: ${results.length} за ${sec.toFixed(0)}с (${(sec / results.length).toFixed(2)} с/стр)`);
console.log(`оценки: ${JSON.stringify(hist)}`);
console.log(`принято (>=9): ${results.length - below.length} | ниже порога: ${below.length}`);
for (const b of below) {
  console.log(`--- ${b.score}/10 | ${b.msgid.slice(0, 80)}`);
  console.log(`    ${b.issues.join("; ").slice(0, 300)}`);
}
writeFileSync(
  join(REPO, "tmp", "judge_fresh_9b_result.json"),
  JSON.stringify({ sec, hist, below }, null, 1),
  "utf8",
);
