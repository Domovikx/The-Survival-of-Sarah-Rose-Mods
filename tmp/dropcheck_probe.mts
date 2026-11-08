/**
 * tmp/dropcheck_probe.mts — узкий ДЕТЕКТОР ПОТЕРЬ: один вопрос за раз
 * «какие фрагменты SOURCE без counterpart в CANDIDATE?».
 *
 * Замер: должен ловить реальные потери (6 негативных) и НЕ срабатывать
 * на парфразах (9 хороших es-строк).
 *
 * Запуск: node tmp/dropcheck_probe.mts
 */
import { readFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

const BASE = "http://127.0.0.1:1234";
const MODEL = "qwen/qwen3.5-9b";

async function chat(messages: unknown[], temp = 0.1, maxTokens = 400): Promise<string> {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, temperature: temp, max_tokens: maxTokens, reasoning_effort: "none" }),
  });
  const d = await res.json();
  return d.choices?.[0]?.message?.content ?? "";
}

const DROP_SYSTEM = `You check ONE thing: does the translation (CANDIDATE) cover the whole SOURCE?

A paraphrase, a synonym, an equivalent idiom, word reordering, or a REQUIRED replacement of a term the target forbids all COUNTS as coverage. Different wording is NOT a drop.

Only a source clause/concept with NO counterpart at all counts as dropped. Judge concept by concept, not word by word.

Output STRICT JSON only: {"dropped":["<exact source fragment>", ...]}. Empty array if everything is covered. No text outside the JSON.`;

const es = parsePo(readFileSync("patches/ai-voice-pack/po/es.po", "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid,
);

async function dropped(entry: (typeof es)[number], cand: string): Promise<string[]> {
  const out = await chat([
    { role: "system", content: DROP_SYSTEM },
    { role: "user", content: `SOURCE (EN): ${entry.msgid}\nCANDIDATE: ${cand}` },
  ]);
  try {
    const j = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    return Array.isArray(j.dropped) ? j.dropped : [];
  } catch {
    return ["__PARSE_ERROR__"];
  }
}

console.log("=== НЕГАТИВ: потери обязаны быть найдены ===");
const NEG: Array<{ frag: string; bad: string }> = [
  {
    frag: "Sarah still felt every part of her being controlled",
    bad: "Sarah seguía sintiendo que la controlaban, el pelo tirado con fuerza, el coño expuesto y con él entrando en ella.",
  },
  { frag: "Sarah moaned out louder", bad: "Sarah se durmió tranquilamente mientras leía un libro de recetas." },
  {
    frag: "Her belly expanded, her ankles swole up",
    bad: "Su vientre se hinchó, los tobillos se hincharon y sentía náuseas matutinas. Elle se sentait mal au matin.",
  },
  {
    frag: "Just enough to get her clit",
    bad: "Justo lo necesario para apoyar su clítoris sobre la parte alta de su pierna. él era un hombre alto.",
  },
];
let negHit = 0;
for (const c of NEG) {
  const e = es.find((x) => x.msgid.includes(c.frag));
  if (!e) continue;
  const d = await dropped(e, c.bad);
  const hit = d.length > 0;
  if (hit) negHit++;
  console.log(`  ${hit ? "ЛОВИТ " : "МИМО   "} ${d.join(" | ").slice(0, 90)}`);
}
console.log(`  итог: ${negHit}/${NEG.length}`);

console.log("\n=== ПОЗИТИВ: хорошие переводы НЕ должны срабатывать ===");
let posFalse = 0;
let n = 0;
for (const e of es) {
  if (!e.msgstr.trim() || e.msgid.length < 60 || isSpeech(e) === false) continue;
  n++;
  if (n > 9) break;
  const d = await dropped(e, e.msgstr);
  if (d.length) {
    posFalse++;
    console.log(`  ЛОЖНЫЙ: ${e.msgid.slice(0, 46)} -> ${d.join(" | ").slice(0, 80)}`);
  }
}
console.log(`  ложных срабатываний: ${posFalse}/${n}`);

function isSpeech(e: (typeof es)[number]): boolean {
  return (e.msgctxt ?? "").includes("speaker");
}
