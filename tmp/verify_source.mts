/**
 * tmp/verify_source.mts — сверка аудита с СЫРЬЁМ игры (game/*.rpy).
 *
 * Правило владельца 2026-10-23: mods/ — наш мод, НЕ источник; источник —
 * game/script.rpy. Поэтому: лейбл строки берём ИЗ исходника (enclosing
 * `label X:`), арку лейбла считает potgen.arcOfLabel (правила из имён
 * лейблов, никаких внешних json / label_arc.json).
 *
 * Проверяет два класса tmp/role_audit.json:
 *   ARC    (файл в Other/, POT-арка другая) — есть ли строка в сырье,
 *          какой у неё реальный лейбл/арка, совпадает ли с POT-комментом.
 *   STALE  (uid нет в POT) — берёт тексты из tmp/stale_uid_text.json
 *          (история POT): строка ещё в сырье (POT потерял) или выпала
 *          (файл действительно мёртвый).
 *
 * Отчёт: stdout + tmp/verify_source_report.json.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { arcOfLabel, collectRpyFiles } from "../.opencode/skills/renpy-po/potgen.mts";
import { loadCatalog } from "../patches/ai-voice-pack/tools/generate/scripts/voice_batch.mts";

const GAME = "C:/Program Files (x86)/Steam/steamapps/common/The Survival of Sarah Rose/game";
const LABEL_RE = /^label\s+([A-Za-z0-9_.]+)\s*:/;

interface Target {
  uid: string;
  text: string;
  potArc: string | null; // для ARC: arc-коммент POT; для STALE: из истории
  potScene: string | null;
  kind: "ARC" | "STALE";
  file?: string;
  lineNo?: number;
  srcLabel?: string;
  /** Варианты текста для поиска в сыре (\", \n — экранирование исходника). */
  variantsCache?: string[];
}

// ------------------------------------------------------------- цели -------

const audit = JSON.parse(readFileSync("tmp/role_audit.json", "utf8"));
const potByUid = new Map<string, { old: string; arc: string | null; scene: string | null }>();
for (const e of loadCatalog()) {
  if (!potByUid.has(e.uid)) potByUid.set(e.uid, { old: e.old, arc: e.arc, scene: e.scene ?? null });
}

const targets = new Map<string, Target>(); // ключ = сам текст (uid = md5)
for (const f of audit.langs.ru.findings) {
  if (f.kind !== "ARC") continue;
  const p = potByUid.get(f.uid);
  if (!p) continue; // не должно случиться: ARC ⊂ речь POT
  const key = p.old;
  if (!targets.has(key)) {
    targets.set(key, {
      uid: f.uid,
      text: p.old,
      potArc: p.arc,
      potScene: p.scene,
      kind: "ARC",
    });
  }
}
let staleTexts = 0;
const staleWanted = new Set(
  audit.langs.ru.findings.filter((f: { kind: string }) => f.kind === "STALE").map((f: { uid: string }) => f.uid),
);
try {
  const stale: Record<string, { old: string; arc: string | null; scene: string | null }> = JSON.parse(
    readFileSync("tmp/stale_uid_text.json", "utf8"),
  );
  for (const uid of staleWanted) {
    const v = stale[uid];
    if (!v || targets.has(v.old)) continue;
    targets.set(v.old, { uid, text: v.old, potArc: v.arc, potScene: v.scene, kind: "STALE" });
    staleTexts++;
  }
} catch {
  /* extract_stale ещё не отработал — STALE-часть опустится */
}
console.log(`STALE-текстов найдено в истории: ${staleTexts} / ${staleWanted.size}`);
const list = [...targets.values()];
console.log(`целей: ${list.length} (ARC из POT, STALE-текстов из истории: ${staleTexts})`);

// -------------------------------------------------- скан game/*.rpy ------

function variantsOf(text: string): string[] {
  const v = new Set<string>([text]);
  if (text.includes('"')) v.add(text.replace(/"/g, '\\"'));
  if (text.includes("\n")) v.add(text.replace(/\n/g, "\\n"));
  if (text.includes('"') && text.includes("\n")) {
    v.add(text.replace(/"/g, '\\"').replace(/\n/g, "\\n"));
  }
  return [...v];
}
for (const t of list) t.variantsCache = variantsOf(t.text);

let unresolved = list.length;
const files = collectRpyFiles(GAME);
console.log(`rpy-файлов: ${files.length}`);
outer: for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  let label = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lm = line.match(LABEL_RE);
    if (lm) label = lm[1];
    if (unresolved === 0) break outer;
    if (!line.length) continue;
    for (const t of list) {
      if (t.srcLabel !== undefined) continue;
      if (t.variantsCache.some((v) => line.includes(v))) {
        t.file = file;
        t.lineNo = i + 1;
        t.srcLabel = label || "(вне label)";
        unresolved--;
      }
    }
  }
}
console.log(`найдено в сырье: ${list.length - unresolved}/${list.length}`);

// ------------------------------------------------------------ отчёт -------

interface Summary {
  found: number;
  notFound: number;
  sceneEqLabel: number;
  potArcEqSrc: number;
  srcArcVsOther: Record<string, number>;
  notFoundSamples: string[];
}
const byKind: Record<string, Summary> = {};
const detail: Record<string, unknown[]> = { ARC: [], STALE: [] };

for (const t of list) {
  const s =
    byKind[t.kind] ??
    (byKind[t.kind] = {
      found: 0,
      notFound: 0,
      sceneEqLabel: 0,
      potArcEqSrc: 0,
      srcArcVsOther: {},
      notFoundSamples: [],
    });
  const srcArc = t.srcLabel ? arcOfLabel(t.srcLabel) : undefined;
  if (!t.srcLabel) {
    s.notFound++;
    if (s.notFoundSamples.length < 10) s.notFoundSamples.push(t.text.slice(0, 90));
  } else {
    s.found++;
    if (t.potScene && t.potScene === t.srcLabel) s.sceneEqLabel++;
    if (srcArc && t.potArc && srcArc === t.potArc) s.potArcEqSrc++;
    const key = `${srcArc ?? "?"} vs файл Other`;
    s.srcArcVsOther[key] = (s.srcArcVsOther[key] ?? 0) + 1;
  }
  detail[t.kind]!.push({
    uid: t.uid,
    text: t.text.slice(0, 100),
    potArc: t.potArc,
    potScene: t.potScene,
    srcFile: t.file?.split(/[\\/]/).slice(-1)[0],
    srcLine: t.lineNo,
    srcLabel: t.srcLabel ?? null,
    srcArc: srcArc ?? null,
  });
}

for (const [kind, s] of Object.entries(byKind)) {
  console.log(`\n=== ${kind}:`);
  console.log(`  в сырье найдено: ${s.found} | НЕ найдено: ${s.notFound}`);
  console.log(`  POT scene == лейбл сырья: ${s.sceneEqLabel}`);
  console.log(`  arcOfLabel(сырьё) == arc POT: ${s.potArcEqSrc}`);
  console.log(`  арка по сырью (для найденных): ${JSON.stringify(s.srcArcVsOther)}`);
  if (s.notFoundSamples.length) {
    console.log("  примеры НЕ найденных:");
    for (const x of s.notFoundSamples) console.log(`    - ${x}`);
  }
}

writeFileSync("tmp/verify_source_report.json", JSON.stringify({ summary: byKind, detail }, null, 2), "utf8");
console.log("\nJSON: tmp/verify_source_report.json");
