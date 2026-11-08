/**
 * tmp/rulequote_probe.mts — гипотеза: обязать судью ЦИТИРОВАТЬ правило
 * в каждом замечании -> выдуманные придирки не выживают (нечем обосновать).
 *
 * Проверяем на 4 проблемных строках es: меняется ли качество замечаний
 * и стабилизируется ли балл.
 *
 * Запуск: node tmp/rulequote_probe.mts
 */
import { readFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { judgeStable } from "../.opencode/skills/renpy-po/po_translate.mts";

const BASE = "http://127.0.0.1:1234";
const MODEL = "qwen/qwen3.5-9b";

const RULE_HOOK =
  `RULE-QUOTE REQUIREMENT: every issue MUST end with a parenthetical citation of the exact rule line it violates, ` +
  `in the form (rule: <verbatim quote from the task rules>). If you cannot quote such a line, DO NOT report the issue ` +
  `— it is not a violation. Issues without a rule citation are discarded automatically.\n\n`;

const es = parsePo(readFileSync("patches/ai-voice-pack/po/es.po", "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid,
);
const frags = [
  "Sarah moaned out louder at the sudden penetration",
  "Sarah cried out through gritted teeth at his sudden penetration",
  "Her belly expanded, her ankles swole up",
  "Just enough to get her clit onto his upper thigh",
];

// хак: подставляем свой user-промпт, обёрнутый в нашу добавку
const { judgeUser, judgeSystem } = await import("../.opencode/skills/renpy-po/po_translate.mts");

async function judgeWithHook(entry: (typeof es)[number]) {
  const user = RULE_HOOK + judgeUser("es", entry, entry.msgstr, null);
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: judgeSystem(entry.msgctxt) },
        { role: "user", content: user },
      ],
      temperature: 0.1,
      max_tokens: 900,
      reasoning_effort: "none",
    }),
  });
  const d = await res.json();
  const text = d.choices?.[0]?.message?.content ?? "";
  const m = /"score"\s*:\s*"?(\d+)/.exec(text);
  const score = m ? Number(m[1]) : -1;
  const im = /"issues"\s*:\s*\[([\s\S]*?)\]/.exec(text);
  const issues = im ? ([...im[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]) as string[]) : [];
  return { score, issues };
}

for (const frag of frags) {
  const e = es.find((x) => x.msgid.includes(frag));
  if (!e) continue;
  console.log(`\n${e.msgid.slice(0, 62)}`);
  console.log(`  сейчас: ${e.msgstr}`);
  // без хука (контроль) и с хуком
  const plain = await judgeStable(BASE, MODEL, "es", e, e.msgstr, null, 9);
  const hooked = await judgeWithHook(e);
  console.log(`  БЕЗ rule-quote: ${plain.score}/10  [${plain.issues.join(" | ")}]`);
  console.log(`  С rule-quote:   ${hooked.score}/10`);
  for (const i of hooked.issues) console.log(`      * ${i}`);
}
