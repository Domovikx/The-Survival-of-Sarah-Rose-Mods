/**
 * demo_scope_scan.mts — разовый замер границ DEMO-объёма по шаблону POT:
 * сцены в ПОРЯДКЕ ИГРЫ (порядок записей файла), арки, наполненность
 * po-файлов внутри кандидатных границ. Для задачи
 * tasks/2026-10-25-demo-e2e-ui-prologue.md (шаг «ресёрч начала»).
 * Запуск: node tmp/demo_scope_scan.mts
 */
import { readFileSync, readdirSync } from "node:fs";

interface PotEntry {
  arc: string;
  scene: string;
  msgctxt: string;
  msgid: string;
}

const parsePot = (text: string): PotEntry[] => {
  const out: PotEntry[] = [];
  for (const b of text.split(/\n\n+/)) {
    if (!b.includes("msgid")) continue;
    const arc = /^#\. arc: (.+)$/m.exec(b)?.[1] ?? "?";
    const scene = /^#\. scene: (.+)$/m.exec(b)?.[1] ?? "?";
    const ctx = /^msgctxt "(.+)"$/m.exec(b)?.[1] ?? "";
    const mid = /^msgid "(.*)"$/m.exec(b)?.[1];
    if (mid === undefined || mid === "") continue; // header
    out.push({ arc, scene, msgctxt: ctx, msgid: mid });
  }
  return out;
};

const entries = parsePot(readFileSync("patches/ai-voice-pack/po/template.pot", "utf-8"));
console.log("всего записей в POT:", entries.length);
const isDialogue = (e: PotEntry): boolean => e.msgctxt.startsWith("speaker:");

// 1. Сцены в порядке первого появления (порядок файла = порядок игры).
const scenes: Array<{ scene: string; arc: string; n: number }> = [];
const idx = new Map<string, number>();
for (const e of entries) {
  const key = `${e.arc}::${e.scene}`;
  if (idx.has(key)) scenes[idx.get(key)!].n++;
  else {
    idx.set(key, scenes.length);
    scenes.push({ scene: e.scene, arc: e.arc, n: 1 });
  }
}
console.log("\n=== первые 30 сцен в порядке игры (arc::scene: кол-во):");
for (const s of scenes.slice(0, 30)) console.log(`  ${s.arc}::${s.scene}: ${s.n}`);
console.log(`всего сцен: ${scenes.length}`);

// 2. Кандидатные границы (диалог/наррация).
const cum = (pred: (e: PotEntry) => boolean): number => entries.filter(pred).length;
console.log("\n=== кандидатные границы (speaker:*, без menu/ui):");
console.log("  scene=start:", cum((e) => e.scene === "start" && isDialogue(e)));
console.log("  arc=Prologue:", cum((e) => e.arc === "Prologue" && isDialogue(e)));
console.log("  scene=start + arc=Prologue:", cum((e) => (e.scene === "start" || e.arc === "Prologue") && isDialogue(e)));

// 3. Наполненность po внутри границы «start + Prologue».
// В po НЕТ комментариев uid/arc (только в POT) — парим по msgctxt+msgid.
const demoPairs = new Set(
  entries
    .filter((e) => (e.scene === "start" || e.arc === "Prologue") && isDialogue(e))
    .map((e) => `${e.msgctxt} ${e.msgid}`),
);
console.log("\n=== наполненность po внутри «scene=start + arc=Prologue»:");
for (const f of readdirSync("patches/ai-voice-pack/po").filter((x) => x.endsWith(".po")).sort()) {
  const text = readFileSync(`patches/ai-voice-pack/po/${f}`, "utf-8").replace(/\r\n/g, "\n");
  let filled = 0;
  for (const b of text.split(/\n\n+/)) {
    if (!b.includes("msgid")) continue;
    const ctx = /^msgctxt "(.+)"$/m.exec(b)?.[1];
    const mid = /^msgid "(.*)"$/m.exec(b)?.[1];
    const ms = /^msgstr "(.*)"$/m.exec(b)?.[1];
    if (ctx && mid && ms !== undefined && ms.trim() !== "" && demoPairs.has(`${ctx} ${mid}`)) filled++;
  }
  console.log(`  ${f}: ${filled}/${demoPairs.size}`);
}
