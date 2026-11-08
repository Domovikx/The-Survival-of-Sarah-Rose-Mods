/**
 * tmp/judge_noise.mts — диагностика шума и обрывов судьи.
 *
 * Три гипотезы причин противоречий (инцидент 2026-10-26, остаток es):
 *   H1 шум: одинаковый промпт -> разные баллы (судья нестабильна);
 *   H2 обрыв: maxTokens 900 мал -> issues режется -> битый JSON -> мусор;
 *   H3 обобщение: пример «pene/vagina FORBIDDEN» судья трактует как
 *      «все анатомические термины запрещены» -> требует clit вместо clítoris.
 *
 * Запуск: node tmp/judge_noise.mts [msgid-fragment] [runs]
 */
import { readFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { judge, judgeSystem, judgeUser } from "../.opencode/skills/renpy-po/po_translate.mts";

const BASE = "http://127.0.0.1:1234";
const MODEL = "qwen/qwen3.5-9b";
const frag = process.argv[2] ?? "Just enough to get her clit";
const runs = Number(process.argv[3] ?? 5);

const es = parsePo(readFileSync("patches/ai-voice-pack/po/es.po", "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid,
);
const entry = es.find((e) => e.msgid.includes(frag));
if (!entry) throw new Error(`не найдено: ${frag}`);

const sys = judgeSystem(entry.msgctxt);
const user = judgeUser("es", entry, entry.msgstr, null);
console.log(`строка: ${entry.msgid}`);
console.log(`промпт: system=${sys.length} user=${user.length} симв.`);
console.log(`в system есть пример «pene/vagina FORBIDDEN»: ${/pene\/vagina/.test(sys)}`);

// сырой вызов — чтобы видеть обрыв и длину
async function rawJudge(temp: number, maxTokens: number) {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      temperature: temp,
      max_tokens: maxTokens,
      reasoning_effort: "none",
    }),
  });
  const d = await res.json();
  const msg = d.choices?.[0]?.message?.content ?? "";
  return { text: msg, finish: d.choices?.[0]?.finish_reason ?? "?" };
}

console.log("\n=== H1/H2: шум и обрыв при temp 0.1, maxTokens 900 ===");
for (let i = 0; i < runs; i++) {
  const { text, finish } = await rawJudge(0.1, 900);
  const truncated = finish === "length" || !text.trim().endsWith("}");
  let score: unknown = "?";
  let nIssues = 0;
  try {
    const j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    score = j.score;
    nIssues = Array.isArray(j.issues) ? j.issues.length : -1;
  } catch {
    score = "BITTY_JSON";
  }
  console.log(
    `  run${i + 1}: score=${score} issues=${nIssues} finish=${finish} rawLen=${text.length}` +
      `${truncated ? "  <== ОБРЫВ" : ""}`,
  );
}

console.log("\n=== H3: как судья реагирует на явное «эти слова НЕ запрещены» ===");
const patchedUser = `${user}\n\nNOTE: these are NOT forbidden and must not be flagged: clit, clítoris, muslo, mojada, empapada.`;
for (let i = 0; i < 3; i++) {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: patchedUser },
      ],
      temperature: 0.1,
      max_tokens: 900,
      reasoning_effort: "none",
    }),
  });
  const d = await res.json();
  const text = d.choices?.[0]?.message?.content ?? "";
  let score: unknown = "?";
  let issues: string[] = [];
  try {
    const j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    score = j.score;
    issues = Array.isArray(j.issues) ? j.issues : [];
  } catch {
    score = "BITTY_JSON";
  }
  console.log(`  patch${i + 1}: score=${score}`);
  for (const s of issues) console.log(`      * ${s}`);
}

// реальная стоимость вызова judge() — с нашими фильтрами
console.log("\n=== фактический вызов judge() x3 (те же условия) ===");
for (let i = 0; i < 3; i++) {
  const v = await judge(BASE, MODEL, "es", entry, entry.msgstr, null);
  console.log(`  judge${i + 1}: score=${v.score} issues=[${v.issues.join(" | ")}]`);
}
