/**
 * tmp/appeal_probe.mts — поможет ли апелляция, когда отсеяна ЧАСТЬ замечаний
 * судьи (сейчас триггер только «отсеяны ВСЕ» — инцидент 2026-10-26).
 *
 * Запуск: node tmp/appeal_probe.mts
 */
import { readFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { actionableJudgeIssues, judge, judgeStable } from "../.opencode/skills/renpy-po/po_translate.mts";

const BASE = "http://127.0.0.1:1234";
const MODEL = "qwen/qwen3.5-9b";
const THRESHOLD = 9;

const es = parsePo(readFileSync("patches/ai-voice-pack/po/es.po", "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid,
);
const frags = [
  "Sarah moaned out louder at the sudden penetration",
  "Sarah cried out through gritted teeth at his sudden penetration",
  "Her belly expanded, her ankles swole up",
  "Just enough to get her clit onto his upper thigh",
];

for (const frag of frags) {
  const e = es.find((x) => x.msgid.includes(frag));
  if (!e) continue;
  const v = await judgeStable(BASE, MODEL, "es", e, e.msgstr, null, THRESHOLD);
  const kept = actionableJudgeIssues(v.issues, "es");
  const dropped = v.issues.length - kept.length;
  console.log(`\n${v.score}/10  ${e.msgid.slice(0, 58)}`);
  console.log(`  issues=${v.issues.length} отсеяно=${dropped} осталось=${kept.length}`);
  for (const i of kept) console.log(`    осталось: ${i}`);
  if (v.score >= THRESHOLD || v.issues.length === 0) {
    console.log("  -> уже принят / замечаний нет");
    continue;
  }
  const ap = await judge(
    BASE,
    MODEL,
    "es",
    e,
    e.msgstr,
    null,
    `Your earlier verdict was ${v.score}/10 with issues [${v.issues.join("; ")}]. ` +
      `REJECTED by the automated rule filter (${dropped} of ${v.issues.length}): they demand a term the task rules ` +
      `mark FORBIDDEN, or they contradict the rules / are not actionable, so obeying them would violate the rules. ` +
      `Re-review the candidate on its own merits against the rules: name a concrete violation ` +
      `(quote the exact fragment and the exact fix) or score 9-10 with []. JSON only.`,
  );
  console.log(`  -> АПЕЛЛЯЦИЯ: ${ap.score}/10  issues=[${ap.issues.join(" | ")}]`);
}
