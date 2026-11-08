/**
 * tmp/breakdown_probe.mts — пошаговая диагностика контура на ЗАВОДОМО
 * бракованном переводе: на каком этапе судья/фильтры теряют дефект.
 *
 * Запуск: node tmp/breakdown_probe.mts
 */
import { readFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import {
  actionableJudgeIssues,
  filterConfirmed,
  judge,
  judgeStable,
  judgeSystem,
  judgeUser,
} from "../.opencode/skills/renpy-po/po_translate.mts";

const BASE = "http://127.0.0.1:1234";
const MODEL = "qwen/qwen3.5-9b";

const es = parsePo(readFileSync("patches/ai-voice-pack/po/es.po", "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid,
);

const BAD =
  "Sarah se durmió tranquilamente mientras leía un libro de recetas.";
const frag = "Sarah moaned out louder";
const e = es.find((x) => x.msgid.includes(frag))!;
console.log(`SOURCE: ${e.msgid}`);
console.log(`BAD   : ${BAD}\n`);

// 1. сырой ответ судьи (что она реально думает)
{
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: judgeSystem(e.msgctxt) },
        { role: "user", content: judgeUser("es", e, BAD, null) },
      ],
      temperature: 0.1,
      max_tokens: 900,
      reasoning_effort: "none",
    }),
  });
  const d = await res.json();
  console.log(`1) СЫРОЙ ОТВЕТ СУДЬИ:\n${d.choices?.[0]?.message?.content}\n`);
}

// 2. judgeStable
const v = await judgeStable(BASE, MODEL, "es", e, BAD, null, 9);
console.log(`2) judgeStable: ${v.score}/10  issues=[${v.issues.join(" | ")}]\n`);

// 3. детерминированный фильтр
const act = actionableJudgeIssues(v.issues, "es");
console.log(`3) actionableJudgeIssues: ${act.length}/${v.issues.length} -> [${act.join(" | ")}]\n`);

// 4. верификатор
if (act.length) {
  const conf = await filterConfirmed(BASE, MODEL, "es", e, BAD, act);
  console.log(`4) filterConfirmed: ${conf.length}/${act.length} -> [${conf.join(" | ")}]\n`);
}

// 5. апелляция
const ap = await judge(
  BASE,
  MODEL,
  "es",
  e,
  BAD,
  null,
  `Your earlier verdict was ${v.score}/10 with issues [${v.issues.join("; ")}]. ` +
    `An automated verification REJECTED every complaint. Re-review the candidate on its own merits: ` +
    `name a concrete violation (quote the exact fragment and the exact rule line) or score 9-10 with []. JSON only.`,
);
console.log(`5) АПЕЛЛЯЦИЯ: ${ap.score}/10  issues=[${ap.issues.join(" | ")}]\n`);
const apAct = actionableJudgeIssues(ap.issues, "es");
if (apAct.length) {
  const apConf = await filterConfirmed(BASE, MODEL, "es", e, BAD, apAct);
  console.log(`6) верификатор апелляции: ${apConf.length}/${apAct.length} -> [${apConf.join(" | ")}]`);
} else {
  console.log(`6) верификатор апелляции: замечаний после фильтра НЕТ -> СТРОКА ЧИСТА (автопринятие!)`);
}
