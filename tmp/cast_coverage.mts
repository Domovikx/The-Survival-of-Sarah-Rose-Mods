// Покрытие: спикеры template.pot ↔ папки casts/ (кто уже имеет голос).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

const ROOT = "C:/Users/Domo/workspace/The-Survival-of-Sarah-Rose-Mods/patches/ai-voice-pack";
const pot = parsePo(readFileSync(join(ROOT, "po/template.pot"), "utf-8")).filter((e) => e.msgid);

const speakers = new Map<string, number>();
for (const e of pot) {
  if (!e.msgctxt.startsWith("speaker:")) continue;
  const name = e.msgctxt.slice("speaker:".length);
  speakers.set(name, (speakers.get(name) ?? 0) + 1);
}

const casts = readdirSync(join(ROOT, "registry", "casts"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const castSet = new Set(casts);
const exact = [...speakers].filter(([n]) => castSet.has(n));
const noCast = [...speakers].filter(([n]) => !castSet.has(n)).sort((a, b) => b[1] - a[1]);
const castsWithoutSpeaker = casts.filter((c) => !speakers.has(c));

console.log(`casts-папок: ${casts.length} (из них Generic-пулов: ${casts.filter((c) => c.startsWith("Generic")).join(", ")})`);
console.log(`спикеров POT: ${speakers.length}`);
console.log(`\nТочное имя каста уже есть: ${exact.length}`);
console.log(`Спикеров БЕЗ каста: ${noCast.length} — голос из основного набора ещё назначить:`);
for (const [n, c] of noCast) console.log(`  ${String(c).padStart(5)}  ${n}`);
console.log(`\nКастов без спикера в POT (не используются напрямую): ${castsWithoutSpeaker.length}`);
console.log("  " + castsWithoutSpeaker.join(", "));
