/**
 * emo_collapse.mts — финал миграции тона (владелец 2026-11-10):
 * слой `#. emotion_new:` схлопывается в `#. emotion:`, строка emotion_new
 * удаляется — в POT остаётся ровно ОДИН слой тона. Атомарная запись.
 * Гарды после запуска: potgen_e2e.test.mts + emotion:audit + po:check.
 *
 * Запуск: node tmp/emo_collapse.mts [--dry]
 */
import { readFileSync } from "node:fs";

import { writePoAtomic } from "../.opencode/skills/renpy-po/po_core.mts";

const POT = "patches/ai-voice-pack/po/template.pot";
const DRY = process.argv.includes("--dry");

const text = readFileSync(POT, "utf-8");
const lines = text.split("\n");
const out: string[] = [];
let collapsed = 0;

for (let i = 0; i < lines.length; i++) {
  const cur = lines[i]!;
  const next = lines[i + 1] ?? "";
  const curEmo = /^#\. emotion: (.*)$/.exec(cur);
  const nextNew = /^#\. emotion_new: (.*)$/.exec(next);
  if (curEmo && nextNew) {
    out.push(`#. emotion: ${nextNew[1]}`); // новый тон становится единственным
    i++; // строку emotion_new пропускаем
    collapsed++;
    continue;
  }
  // emotion_new без предшествующего emotion (не должно быть) — превращаем в emotion
  const solo = /^#\. emotion_new: (.*)$/.exec(cur);
  if (solo) {
    out.push(`#. emotion: ${solo[1]}`);
    collapsed++;
    continue;
  }
  out.push(cur);
}

console.log(`схлопнуто записей: ${collapsed}`);
if (DRY) {
  console.log("dry: файл не изменён");
  process.exit(0);
}
writePoAtomic(POT, out.join("\n"));
console.log(`записан: ${POT}`);
