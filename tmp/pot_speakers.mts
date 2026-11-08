// Статистика спикеров по template.pot + сверка с реестром голосов (who_map/casts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

const ROOT = "C:/Users/Domo/workspace/The-Survival-of-Sarah-Rose-Mods/patches/ai-voice-pack";
const pot = parsePo(readFileSync(join(ROOT, "po/template.pot"), "utf-8")).filter((e) => e.msgid);

// Спикеры: speaker:<Имя>, кроме speaker-name (это переводимые имена, не речь).
const bySpeaker = new Map<string, number>();
let narration = 0, menu = 0, ui = 0, speakerName = 0;
for (const e of pot) {
  if (!e.msgctxt.startsWith("speaker:")) {
    if (e.msgctxt === "menu") menu++;
    else if (e.msgctxt === "ui") ui++;
    else if (e.msgctxt === "speaker-name") speakerName++;
    continue;
  }
  const name = e.msgctxt.slice("speaker:".length);
  if (name === "Narrator") narration++;
  bySpeaker.set(name, (bySpeaker.get(name) ?? 0) + 1);
}
const speakers = [...bySpeaker.entries()].sort((a, b) => b[1] - a[1]);

// Реестр голосов.
const whoMap = readFileSync(join(ROOT, "registry/who_map.jsonl"), "utf-8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as { character: string; define: string[] });
const whoNames = new Set(whoMap.map((w) => w.character));

console.log(`ВСЕГО уникальных спикеров в POT (вкл. Narrator): ${speakers.length}`);
console.log(`  Narrator (нарратор): ${narration} записей`);
console.log(`  Персонажей (без Narrator): ${speakers.length - 1}`);
console.log(`  Меню: ${menu}, ui: ${ui}, speaker-name (имена): ${speakerName}`);
console.log();
console.log(`Список спикеров (записей):`);
let inWho = 0, notInWho = 0;
for (const [name, n] of speakers) {
  const inRegistry = whoNames.has(name);
  if (name !== "Narrator") { if (inRegistry) inWho++; else notInWho++; }
  console.log(`  ${String(n).padStart(6)}  ${name}${inRegistry ? "" : name === "Narrator" ? "  [narration-ключ: who_to_voice['narrator']]" : "  [нет в who_map]"}`);
}
console.log();
console.log(`Сверка с who_map.jsonl: персонажей в реестре ${whoNames.size}; из POT-спикеров совпало ${inWho}, POT-спикеров нет в реестре ${notInWho}.`);
const potNames = new Set(speakers.map(([n]) => n));
const ghost = [...whoNames].filter((n) => !potNames.has(n));
console.log(`В реестре есть, но в POT реплик нет: ${ghost.length ? ghost.join(", ") : "нет"}`);
