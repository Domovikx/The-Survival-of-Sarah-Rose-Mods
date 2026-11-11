/**
 * emo_judge_e2e.mts — E2E-калибровка судьи тона (инъекции → пойман → откат).
 * Меряет RECALL судьи на заведомо битых тонах (объективно неверных) и
 * стабильность (повторный суд той же пары). Никаких «правильных ответов»
 * не хардкодит: битые тоны ГЕНЕРИРУЮТСЯ из чужих строк/шаблонов.
 *
 * Запуск: node tmp/emo_judge_e2e.mts [n]
 *   n — число демо-строк в замере (по умолчанию 12, 4 инъекции на строку).
 */
import {
  JUDGE_SYSTEM,
  parseToneVerdict,
  toneJudgeUser,
} from "../patches/ai-voice-pack/tools/generate/scripts/emotion_judge.mts";
import { voicedEntries } from "../patches/ai-voice-pack/tools/generate/scripts/emotion_tag.mts";
import type { CatalogEntry } from "../patches/ai-voice-pack/tools/generate/scripts/voice_batch.mts";
import { DEMO_SCENES } from "../.opencode/skills/renpy-po/po2tl.mts";
import { resolveBackend } from "../scripts/llm_backend.mts";

const N = Number(process.argv[2] ?? 12);
const backend = resolveBackend();
const baseUrl = process.env.LLM_URL ?? backend.url;
const model = process.env.LLM_MODEL ?? backend.model;

const isDemo = (e: CatalogEntry): boolean => e.arc === "Prologue" || DEMO_SCENES.has(e.scene ?? "");

async function ask(system: string, user: string): Promise<ReturnType<typeof parseToneVerdict>> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
      max_tokens: 600,
      reasoning_effort: "none",
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return parseToneVerdict(d.choices?.[0]?.message?.content ?? "");
}

const voiced = voicedEntries();
const demo = voiced.filter((e) => isDemo(e) && (e.emotion ?? "").trim());
// детерминированная stride-выборка
const k = Math.max(1, Math.floor(demo.length / N));
const sample = demo.filter((_, i) => i % k === 0).slice(0, N);

// инъекции: объективно битые тоны (генерируем, не хардкодим ответы)
const RU_TONE = "Уставшая и примирившаяся"; // не-английский тон
const CONTENT_TONE = "Tells the story of a princess and her father"; // пересказ содержания
const inj = (e: CatalogEntry, i: number): Array<{ cls: string; ton: string }> => {
  const other = demo[(i * 97 + 13) % demo.length]!.emotion!; // тон ЧУЖОЙ строки (противоречие)
  return [
    { cls: "чужой тон (противоречие сцене)", ton: other },
    { cls: "не-английский тон", ton: RU_TONE },
    { cls: "пересказ содержания", ton: CONTENT_TONE },
    { cls: "пустой/мусор", ton: "asdf qwer" },
  ];
};

const stats: Record<string, { total: number; caught: number }> = {};
const unstable: string[] = [];

for (let i = 0; i < sample.length; i++) {
  const e = sample[i]!;
  const good = e.emotion!;
  const user = (ton: string) => toneJudgeUser(e, ton, demo[i - 1]?.old, demo[i + 1]?.old);

  // 1) базовый тон (не обязан проходить — это предмет волны 1; меряем «стабильность»)
  const v1 = await ask(JUDGE_SYSTEM, user(good));
  const v2 = await ask(JUDGE_SYSTEM, user(good));
  if (v1.score >= 8 !== v2.score >= 8) unstable.push(e.uid);

  // 2) инъекции: считаем пойманными при score < 8
  for (const { cls, ton } of inj(e, i)) {
    const v = await ask(JUDGE_SYSTEM, user(ton));
    stats[cls] ??= { total: 0, caught: 0 };
    stats[cls]!.total++;
    if (v.score < 8) stats[cls]!.caught++;
    else console.log(`  ПРОПУСК [${cls}] uid=${e.uid} score=${v.score} тон="${ton.slice(0, 40)}"`);
  }
  console.log(`строка ${i + 1}/${sample.length}: базовый score=${v1.score}/${v2.score}`);
}

console.log("\n=== RECALL по классам инъекций (поймано/всего):");
for (const [cls, s] of Object.entries(stats)) console.log(`  ${cls}: ${s.caught}/${s.total}`);
console.log(`=== стабильность базового тона: расхождений ${unstable.length}/${sample.length}`);
console.log(`модель: ${model} @ ${baseUrl}`);
