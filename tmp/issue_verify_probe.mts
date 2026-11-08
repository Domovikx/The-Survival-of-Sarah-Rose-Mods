/**
 * tmp/issue_verify_probe.mts — гипотеза: ВТОРОЙ вызов LLM проверяет каждое
 * замечание судьи («процитируй правило и покажи фрагмент кандидата»).
 * Ложные придирки («matutinas — anglicism», «de golpe — anglicism»,
 * «clítoris — clinical») должны отсеяться, после чего апелляция ставит 9-10.
 *
 * Запуск: node tmp/issue_verify_probe.mts
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
For EACH complaint you must decide if it is a REAL rule violation, using ONLY the target-language rules supplied in the user message.

A complaint is REJECTED when:
- it demands a term the rules mark FORBIDDEN, or contradicts the rules;
- it claims a rule that the rules do not contain (you cannot quote its line);
- it is a stylistic preference (a different acceptable synonym/phrasing);
- it flags a word as wrong when it is correct in the target language (check spelling/grammar yourself).

Output STRICT JSON only: {"keep":[<index numbers of REAL violations>],"reject":[<index numbers>]}.
No text outside the JSON.`;

const es = parsePo(readFileSync("patches/ai-voice-pack/po/es.po", "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid,
);
const frags = [
  "Sarah moaned out louder at the sudden penetration",
  "Sarah cried out through gritted teeth at his sudden penetration",
  "Her belly expanded, her ankles swole up",
  "Just enough to get her clit onto his upper thigh",
];

const { langProfile, languageRules } = await import("../.opencode/skills/renpy-po/po_langs/index.mts");

for (const frag of frags) {
  const e = es.find((x) => x.msgid.includes(frag));
  if (!e) continue;
  const v = await judgeStable(BASE, MODEL, "es", e, e.msgstr, null, 9);
  const issues = meaningfulIssues(v.issues);
  console.log(`\n${e.msgid.slice(0, 58)}`);
  console.log(`  судья: ${v.score}/10`);
  issues.forEach((i, n) => console.log(`    [${n}] ${i}`));
  if (v.score >= 9 || issues.length === 0) continue;

  const verifyUser =
    `TARGET-LANGUAGE RULES:\n${languageRules("es")}\n\n${langProfile("es").judgeNotes}\n\n` +
    `SOURCE (EN): ${e.msgid}\nCANDIDATE (${e.msgctxt}): ${e.msgstr}\n\n` +
    `COMPLAINTS:\n` +
    issues.map((i, n) => `${n}. ${i}`).join("\n");
  const out = await chat([
    { role: "system", content: VERIFY_SYSTEM },
    { role: "user", content: verifyUser },
  ]);
  let keep: number[] = [];
  try {
    const j = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    keep = Array.isArray(j.keep) ? j.keep : [];
  } catch {
    /* битый JSON -> считаем, что ничего не подтверждено */
  }
  const surviving = keep.map((n) => issues[n]).filter(Boolean);
  console.log(`  верификатор: подтверждено ${surviving.length}/${issues.length}`);
  for (const s of surviving) console.log(`    ОСТАЛОСЬ: ${s}`);
  if (surviving.length === 0) {
    const ap = await chat([
      { role: "system", content: "You are a localization QA reviewer. Output STRICT JSON only: {\"score\":<0-10 int>,\"issues\":[...]}. No text outside the JSON." },
      {
        role: "user",
        content:
          `SOURCE: ${e.msgid}\nCANDIDATE: ${e.msgstr}\n\n` +
          `Your earlier verdict was ${v.score}/10, but an automated verification REJECTED every complaint you listed ` +
          `(none could be backed by a rule from the target-language rules above). Re-review the candidate on its own merits ` +
          `against the rules: if there is a concrete violation, name it with the rule line; otherwise score 9-10 with [].`,
      },
    ]);
    const m = /"score"\s*:\s*"?(\d+)/.exec(out.length ? ap : ap);
    console.log(`  -> после апелляции: ${m ? m[1] : "?"}/10   ${ap.slice(0, 160)}`);
  }
}
