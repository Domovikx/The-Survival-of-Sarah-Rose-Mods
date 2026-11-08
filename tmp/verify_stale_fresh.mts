/**
 * tmp/verify_stale_fresh.mts — правда по СЫРЬЮ: свежий scanGame(game/) vs
 * текущий POT vs 77 STALE-файлов.
 *
 * STALE = uid файла нет в POT (HEAD). uid = md5(текст) — игра на рантайме
 * считает uid от СВОЕГО текста, POT при воспроизведении не участвует.
 * Поэтому мёртвость файла решается так: uid ∈ uidOf(строк свежей игры)?
 *   да  → строка жива, POT её потерял/ещё не перегенерен — файл может играть
 *         (сверить арку файла с arcOfLabel(лейбла));
 *   нет → строки в игре больше нет (текст изменился) → файл мёртв навсегда.
 *
 * Бонус: дельта свежих uid vs POT uid — насколько POT отстаёт от игры
 * (нужен ли potgen по итогам апдейта 19.10).
 */
import { readFileSync, writeFileSync } from "node:fs";

import { scanGame } from "../.opencode/skills/renpy-po/potgen.mts";
import { loadCatalog } from "../patches/ai-voice-pack/tools/generate/scripts/voice_batch.mts";

const GAME = "C:/Program Files (x86)/Steam/steamapps/common/The Survival of Sarah Rose/game";

const audit = JSON.parse(readFileSync("tmp/role_audit.json", "utf8"));
const stale = audit.langs.ru.findings.filter((f: { kind: string }) => f.kind === "STALE");
const staleUids: string[] = [...new Set(stale.map((f: { uid: string }) => f.uid))];

console.log("scanGame: парсинг свежей игры…");
const cat = scanGame(GAME);
console.log(`свежих записей: ${cat.entries.size}`);

const freshByUid = new Map<string, { msgctxt: string; arc?: string; scene?: string }>();
for (const e of cat.entries.values()) {
  if (!freshByUid.has(e.uid)) freshByUid.set(e.uid, { msgctxt: e.msgctxt, arc: e.arc, scene: e.scene });
}

// POT (HEAD) uid-сети
const potUids = new Set(loadCatalog().map((e) => e.uid));
const freshUids = new Set(freshByUid.keys());
let potOnly = 0;
for (const u of potUids) if (!freshUids.has(u)) potOnly++;
let freshOnly = 0;
const freshOnlySample: string[] = [];
for (const u of freshUids) {
  if (!potUids.has(u)) {
    freshOnly++;
    if (freshOnlySample.length < 10) {
      const e = freshByUid.get(u)!;
      freshOnlySample.push(`${u.slice(0, 8)} ${e.msgctxt} arc=${e.arc} scene=${e.scene}`);
    }
  }
}
console.log(`\nuid: свежая игра ${freshUids.size} | POT ${potUids.size}`);
console.log(`  только в игре (POT отстаёт): ${freshOnly}`);
for (const s of freshOnlySample) console.log(`    + ${s}`);
console.log(`  только в POT (строки ушли из игры): ${potOnly}`);

// STALE-77: живы ли в свежей игре?
const report: unknown[] = [];
let alive = 0;
let dead = 0;
console.log(`\nSTALE uid (${staleUids.length}):`);
for (const uid of staleUids) {
  const f = freshByUid.get(uid);
  const fileDir = stale.find((x: { uid: string }) => x.uid === uid)?.rel.split("/")[0];
  if (f) {
    alive++;
    report.push({ uid, status: "ALIVE_IN_GAME", fileDir, ...f, fileArcMatch: f.arc === fileDir });
  } else {
    dead++;
    report.push({ uid, status: "DEAD", fileDir });
  }
}
console.log(`  живы в свежей игре (POT потерял): ${alive}`);
console.log(`  строка исчезла из игры (файл мёртв): ${dead}`);
const aliveArcMismatch = report.filter(
  (r: { status?: string; fileArcMatch?: boolean }) => r.status === "ALIVE_IN_GAME" && r.fileArcMatch === false,
).length;
console.log(`  из живых — арка файла не совпала с аркой свежей строки: ${aliveArcMismatch}`);

writeFileSync("tmp/stale_fresh_report.json", JSON.stringify(report, null, 2), "utf8");
console.log("JSON: tmp/stale_fresh_report.json");
