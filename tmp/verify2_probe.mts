/**
 * tmp/verify2_probe.mts — второй круг: замечания АПЕЛЛЯЦИИ тоже идут
 * через верификатор; если и они не подтвердились — строка проходит
 * (нет подтверждённых нарушений правил = перевод им соответствует).
 *
 * Запуск: node tmp/verify2_probe.mts
 */
import { readFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { judgeStable, meaningfulIssues } from "../.opencode/skills/renpy-po/po_translate.mts";

const BASE = "http://127.0.0.1:1234";
const MODEL = "qwen/qwen3.5-9b";

async function chat(messages: unknown[], temp = 0.1): Promise<string> {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, temperature: temp, max_tokens: 900, reasoning_effort: "none" }),
  });
  const d = await res.json();
  return d.choices?.[0]?.message?.content ?? "";
}

const VERIFY_SYSTEM = `You are a verification layer over another QA reviewer's complaints about a translation (EN -> target).
Decide for EACH complaint whether it is a REAL violation of the target-language rules supplied in the user message.

Reject a complaint when ANY of these holds:
- it demands or implies a term the rules mark FORBIDDEN, or contradicts the rules;
- you cannot quote a line of the supplied rules that it violates;
- it is a stylistic preference (another acceptable synonym or phrasing);
- its factual claim about the candidate is WRONG — verify spelling, grammar and word function YOURSELF first.
  Example: "su" before a noun is a possessive, NOT a gendered adjective — a complaint demanding "su -> la" is wrong.
  Example: a normal target-language word called "an anglicism" is wrong unless the rules say so.

Be conservative: when in doubt, REJECT the complaint.
Output STRICT JSON only: {"keep":[<indexes of REAL violations>],"reject":[<indexes>]}. No text outside the JSON.`;


const { langProfile, languageRules } = await import("../.opencode/skills/renpy-po/po_langs/index.mts");
const { judgeUser, judgeSystem } = await import("../.opencode/skills/renpy-po/po_translate.mts");

const es = parsePo(readFileSync("patches/ai-voice-pack/po/es.po", "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid,
);
const frags = [
  "Sarah moaned out louder at the sudden penetration",
  "Sarah cried out through gritted teeth at his sudden penetration",
  "Her belly expanded, her ankles swole up",
  "Just enough to get her clit onto his upper thigh",
];

async function verify(entry: (typeof es)[number], issues: string[]): Promise<string[]> {
  const user =
    `TARGET-LANGUAGE RULES:\n${languageRules("es")}\n\n${langProfile("es").judgeNotes}\n\n` +
    `SOURCE (EN): ${entry.msgid}\nCANDIDATE (${entry.msgctxt}): ${entry.msgstr}\n\n` +
    `COMPLAINTS:\n${issues.map((i, n) => `${n}. ${i}`).join("\n")}`;
  const out = await chat([
    { role: "system", content: VERIFY_SYSTEM },
    { role: "user", content: user },
  ]);
  try {
    const j = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    const keep: number[] = Array.isArray(j.keep) ? j.keep : [];
    return keep.map((n) => issues[n]).filter(Boolean);
  } catch {
    return [];
  }
}

for (const frag of frags) {
  const e = es.find((x) => x.msgid.includes(frag));
  if (!e) continue;
  console.log(`\n${e.msgid.slice(0, 58)}`);
  let v = await judgeStable(BASE, MODEL, "es", e, e.msgstr, null, 9);
  console.log(`  судья: ${v.score}/10  issues=[${meaningfulIssues(v.issues).join(" | ")}]`);

  // круг 1
  let kept = await verify(e, meaningfulIssues(v.issues));
  if (v.score < 9 && kept.length === 0 && meaningfulIssues(v.issues).length > 0) {
    console.log(`  верификатор-1: 0 подтверждено -> апелляция`);
    v = await judge(
      e,
      `Your earlier verdict was ${v.score}/10 with issues [${v.issues.join("; ")}]. An automated rule-verification ` +
        `REJECTED every complaint (none could be backed by a line of the target-language rules). Re-review the candidate ` +
        `on its own merits: name a concrete violation with its rule line, or score 9-10 with []. JSON only.`,
    );
    kept = await verify(e, meaningfulIssues(v.issues));
    console.log(`  апелляция: ${v.score}/10, верификатор-2 подтвердил ${kept.length}`);
    for (const s of kept) console.log(`    ОСТАЛОСЬ: ${s}`);
    if (kept.length === 0) console.log(`  => ИТОГ: ПРИНЯТО (нет подтверждённых нарушений правил)`);
    else console.log(`  => ИТОГ: ${v.score}/10, остаются ${kept.length} подтверждённых`);
  } else {
    console.log(`  верификатор-1 подтвердил ${kept.length}`);
    for (const s of kept) console.log(`    ОСТАЛОСЬ: ${s}`);
    console.log(`  => ИТОГ: ${v.score}/10`);
  }
}

async function judge(entry: (typeof es)[number], note: string) {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: judgeSystem(entry.msgctxt) },
        { role: "user", content: judgeUser("es", entry, entry.msgstr, null) + `\n\nAPPEAL: ${note}` },
      ],
      temperature: 0.1,
      max_tokens: 900,
      reasoning_effort: "none",
    }),
  });
  const d = await res.json();
  const text = d.choices?.[0]?.message?.content ?? "";
  const m = /"score"\s*:\s*"?(\d+)/.exec(text);
  const im = /"issues"\s*:\s*\[([\s\S]*?)\]/.exec(text);
  const issues = im ? ([...im[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]) as string[]) : [];
  return { score: m ? Number(m[1]) : -1, issues };
}
