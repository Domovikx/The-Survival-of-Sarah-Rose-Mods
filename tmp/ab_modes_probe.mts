/**
 * tmp/ab_modes_probe.mts — чистый A/B двух режимов judgeVerified:
 *
 *   MODE A (текущий): все замечания отсеяны -> апелляция -> снова отсеяны
 *                    и score >= threshold-2 -> автопринятие (score = threshold)
 *   MODE B (без автопринятия): после апелляции принимаем ТОЛЬКО если сама
 *                    судья >= threshold; иначе отчёт.
 *
 * Метрики: ПОЗИТИВ (9 хороших es-строк -> сколько принято) и
 *          НЕГАТИВ (6 заведомо битых -> сколько отклонено).
 * Качество требует: негатив 6/6 и максимум позитива.
 *
 * Запуск: node tmp/ab_modes_probe.mts
 */
import { readFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import {
  actionableJudgeIssues,
  filterConfirmed,
  judge,
  judgeStable,
} from "../.opencode/skills/renpy-po/po_translate.mts";

const BASE = "http://127.0.0.1:1234";
const MODEL = "qwen/qwen3.5-9b";
const TH = 9;

const APPEAL_NOTE = (score: number, issues: string[]): string =>
  `Your earlier verdict was ${score}/10 with issues [${issues.join("; ")}]. ` +
  `An automated verification REJECTED every complaint (each was checked against the task rules: ` +
  `factually wrong about the candidate, or demanding a FORBIDDEN term, or not backed by any rule line). ` +
  `Re-review the candidate on its own merits: name a concrete violation ` +
  `(quote the exact fragment and the exact rule line) or score 9-10 with []. JSON only.`;

/** Ядро контура без автопринятия (режим B). */
async function modeB(e: (typeof es)[number], cand: string) {
  let v = await judgeStable(BASE, MODEL, "es", e, cand, null, TH);
  if (v.score >= 0 && v.score < TH && v.issues.length > 0) {
    const act = actionableJudgeIssues(v.issues, "es");
    const first = act.length ? await filterConfirmed(BASE, MODEL, "es", e, cand, act) : [];
    if (first.length === 0) {
      if (v.score < TH - 2) return v;
      v = await judge(BASE, MODEL, "es", e, cand, null, APPEAL_NOTE(v.score, v.issues));
      const act2 = actionableJudgeIssues(v.issues, "es");
      const second = act2.length ? await filterConfirmed(BASE, MODEL, "es", e, cand, act2) : [];
      if (second.length === 0 && v.score < TH) return v; // НЕТ автопринятия
      if (second.length > 0) v = { score: v.score, issues: second };
    } else {
      v = { score: v.score, issues: first };
    }
  }
  return v;
}

const es = parsePo(readFileSync("patches/ai-voice-pack/po/es.po", "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid,
);

const POS = [
  "Her belly expanded",
  "Just enough to get her clit",
  "Quicker than she could react",
  "Sarah could feel how wet",
  "Sarah cried out through gritted",
  "Sarah moaned out louder",
  "Sarah still felt every part",
  "She felt the rod",
  "She swallowed more of it",
];
const NEG: Array<[string, string, string]> = [
  [
    "Sarah still felt every part",
    "Sarah seguía sintiendo que la controlaban, el pelo tirado con fuerza, el coño expuesto y con él entrando en ella.",
    "потеря 2-й фразы",
  ],
  ["Sarah moaned out louder", "Sarah se durmió tranquilamente mientras leía un libro de recetas.", "бред"],
  [
    "Her belly expanded",
    "Su vientre se hinchó, los tobillos se hincharon y sentía náuseas matutinas. Elle se sentait mal au matin.",
    "франц. хвост",
  ],
  [
    "She swallowed more of it",
    "Se tragó más, haciendo un trago cada vez que él seguía añadiendo. Ella sintió la penetración profunda y el semen.",
    "FORBIDDEN вставлен",
  ],
  [
    "Just enough to get her clit",
    "Justo lo necesario para apoyar su clítoris sobre la parte alta de su pierna. él era un hombre alto.",
    "лишнее предложение",
  ],
  [
    "Her belly expanded",
    "Su vientre se hinchó, los tobillos se hincharon y él padecía las náuseas matutinas.",
    "подмена субъекта",
  ],
];

console.log("=== ПОЗИТИВ (принять должно все 9) ===");
let aPos = 0;
let bPos = 0;
for (const frag of POS) {
  const e = es.find((x) => x.msgid.includes(frag));
  if (!e) continue;
  const { judgeVerified } = await import("../.opencode/skills/renpy-po/po_translate.mts");
  const a = await judgeVerified(BASE, MODEL, "es", e, e.msgstr, null, TH);
  const b = await modeB(e, e.msgstr);
  if (a.score >= TH) aPos++;
  if (b.score >= TH) bPos++;
  console.log(
    `  A=${String(a.score).padStart(2)}${a.score >= TH ? "✓" : "✗"}  B=${String(b.score).padStart(2)}${
      b.score >= TH ? "✓" : "✗"
    }  ${frag.slice(0, 44)}`,
  );
}
console.log(`  ПОЗИТИВ: режим A ${aPos}/9 | режим B ${bPos}/9\n`);

console.log("=== НЕГАТИВ (отклонить должно все 6) ===");
let aNeg = 0;
let bNeg = 0;
for (const [frag, bad, why] of NEG) {
  const e = es.find((x) => x.msgid.includes(frag));
  if (!e) continue;
  const { judgeVerified } = await import("../.opencode/skills/renpy-po/po_translate.mts");
  const a = await judgeVerified(BASE, MODEL, "es", e, bad, null, TH);
  const b = await modeB(e, bad);
  if (a.score < TH) aNeg++;
  if (b.score < TH) bNeg++;
  console.log(
    `  A=${String(a.score).padStart(2)}${a.score < TH ? "✓" : "✗"}  B=${String(b.score).padStart(2)}${
      b.score < TH ? "✓" : "✗"
    }  ${why}`,
  );
}
console.log(`  НЕГАТИВ: режим A ${aNeg}/6 | режим B ${bNeg}/6`);
