/**
 * tmp/verify_single_probe.mts — узкий верификатор: ОДНО замечание за раз,
 * с обязательной цитатой из кандидата и цитатой правила.
 *
 * Цель: стабильно отбивать ложные придирки 9B:
 *   «'su' should be 'la'» (притяжательное, не прилагательное),
 *   «'él' should be 'ella'» (él = мужчина, верно),
 *   «'matutinas' anglicism» (слово испанское),
 *   «use 'penetración'» (term FORBIDDEN в правилах).
 *
 * Запуск: node tmp/verify_single_probe.mts
 */
import { readFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

const BASE = "http://127.0.0.1:1234";
const MODEL = "qwen/qwen3.5-9b";

async function chat(messages: unknown[], temp = 0.1): Promise<string> {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, temperature: temp, max_tokens: 500, reasoning_effort: "none" }),
  });
  const d = await res.json();
  return d.choices?.[0]?.message?.content ?? "";
}

const VERIFY_ONE_SYSTEM = `You verify ONE complaint another reviewer made about a translation (EN -> target language).
You get the target-language rules, the source line, the candidate, and the complaint.

Steps:
1. Quote verbatim from the CANDIDATE the exact fragment the complaint is about. If the complaint's factual claim about that fragment is wrong (spelling, grammar, word function such as possessive vs adjective, wrong subject), REJECT.
2. Check the rules: if the complaint demands or implies a term the rules mark FORBIDDEN, or if no rule line supports it, REJECT.
3. Only if both checks pass, ACCEPT.

Output STRICT JSON only: {"verdict":"ACCEPT"|"REJECT","why":"<max 12 words>"}. No text outside the JSON.`;

const { languageRules, langProfile } = await import("../.opencode/skills/renpy-po/po_langs/index.mts");

const es = parsePo(readFileSync("patches/ai-voice-pack/po/es.po", "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid,
);

/** Замечания-мишени из реальных прогонов: ложные (ожидаем REJECT) и реальные. */
const CASES: Array<{ frag: string; issue: string; expect: "REJECT" | "ACCEPT" }> = [
  {
    frag: "Just enough to get her clit",
    issue: "Gender agreement: 'su' should be 'la' for Sarah (female).",
    expect: "REJECT",
  },
  {
    frag: "Sarah moaned out louder",
    issue: "Error de concordancia: 'él' debe ser 'ella' (Sarah es femenina).",
    expect: "REJECT",
  },
  {
    frag: "Her belly expanded",
    issue: "sentía náuseas matutinas: 'matutinas' is an Anglicism. Use 'de mañana'.",
    expect: "REJECT",
  },
  {
    frag: "Sarah cried out through gritted teeth",
    issue: "Fidelity: 'penetration' dropped; must use 'penetración' or 'follar'.",
    expect: "REJECT",
  },
  {
    frag: "Just enough to get her clit",
    issue: "Incorrect anatomy: source says 'thigh', candidate must use 'muslo'.",
    expect: "ACCEPT",
  },
  // РЕАЛЬНЫЕ дефекты — верификатор обязан их ПРОПУСТИТЬ (не фильтровать)
  {
    frag: "Sarah could feel how wet she already was",
    issue: "Completeness: the phrase 'pulling out this side of her' is not rendered at all — content dropped.",
    expect: "ACCEPT",
  },
  {
    frag: "Sarah still felt every part of her being controlled",
    issue: "Grammar: 'expuesta' must agree with the feminine subject 'la pussy' in this construction.",
    expect: "ACCEPT",
  },
  // вкусовщина — должна быть отбита
  {
    frag: "Sarah could feel how wet she already was",
    issue: "Synonym preference: 'mojada' should be 'empapada' for a more literary register.",
    expect: "REJECT",
  },
];

for (const c of CASES) {
  const e = es.find((x) => x.msgid.includes(c.frag));
  if (!e) {
    console.log(`?? не найдено: ${c.frag}`);
    continue;
  }
  const user =
    `TARGET-LANGUAGE RULES:\n${languageRules("es")}\n\n${langProfile("es").judgeNotes}\n\n` +
    `SOURCE (EN): ${e.msgid}\nCANDIDATE (${e.msgctxt}): ${e.msgstr}\n\n` +
    `COMPLAINT: ${c.issue}`;
  const out = await chat([
    { role: "system", content: VERIFY_ONE_SYSTEM },
    { role: "user", content: user },
  ]);
  const verdict = /"verdict"\s*:\s*"(ACCEPT|REJECT)"/.exec(out)?.[1] ?? "?";
  const why = /"why"\s*:\s*"([^"]*)"/.exec(out)?.[1] ?? "";
  const mark = verdict === c.expect ? "OK " : "МИМО";
  console.log(`${mark} ожидали ${c.expect.padEnd(6)} получили ${verdict.padEnd(6)} | ${c.issue.slice(0, 60)}`);
  console.log(`      why: ${why}`);
}
