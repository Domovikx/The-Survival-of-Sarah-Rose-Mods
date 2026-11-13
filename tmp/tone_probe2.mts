/**
 * tmp/tone_probe2.mts — минимальная правка вместо переписывания.
 *
 * Идея: не «переведи заново», а «замени только клинические слова, ничего не
 * добавляй, интенсивность не меняй». Проверяем на реальных строках + гейты:
 * клиника ушла? латиница не появилась? имя цело? длина не разъехалась?
 */

import { readFileSync } from "node:fs";

const SKILL = readFileSync(".opencode/skills/translate/SKILL.md", "utf-8");
void SKILL;

const CLINICAL = [
  "половые органы",
  "половой орган",
  "половых органов",
  "влагалищ",
  "пенис",
  "промежност",
  "анус",
  "эякуляц",
  "эрекц",
  "половой акт",
  "генитал",
  "мастурбац",
  "половое сношение",
  "совокуплен",
];

const SYSTEM_D = `You are a Russian literary editor of 18+ erotic prose. You receive ONE source line (en) and its Russian translation. The translation is accurate, but some words may sound clinical (medical, anatomical) instead of literary.

Your task: minimal edit. Replace ONLY the clinical/anatomical wording with the wording a Russian author of erotic prose would use in that exact situation. Keep everything else as it is: same meaning, same facts, same number of beats, same intensity, same point of view, same grammatical gender, same character names, same punctuation and line structure. Do NOT add new images, metaphors, details or sensations. Do NOT make the text more explicit than the source: if the source is a soft euphemism (sex, womanhood), keep a soft euphemism; if the source is crude (pussy, cunt), keep it crude at the same level. If the translation has no clinical wording, return it unchanged.

Output ONLY the resulting Russian line, nothing else.`;

const CASES = [
  ["owner-example", "With her arms now tied behind her back, she almost seemed to be presenting herself, her breasts sticking out, her sex uncovered.", "Теперь, когда её руки были связаны за спиной, казалось, будто она сама себя представляет: грудь выпирала вперёд, а половые органы оставались открытыми.", []],
  ["fingers-into-sex", "Kate began to slowly push two fingers into Sarah's sex.", "Кейт начала медленно вводить два пальца во влагалище Сары.", ["Sarah"]],
  ["cock-into-pussy", "Varga put one hand on his own cock, and slowly guided it into Sarah's pussy, gently pushing into her.", "Варга положил одну руку на свой член и медленно ввёл его во влагалище Сары, нежно проникая внутрь.", ["Sarah"]],
  ["erection", "He waved his erection from side to side.", "Он размахивал своей эрекцией из стороны в сторону.", []],
  ["between-legs", "Her eyes drifted down to between Kate's legs.", "Её глаза соскользнули ниже — к промежности Кейт.", ["Кейт"]],
  ["exposed-her-sex", "Sarah unclapsed her hands and exposed her sex again. Her face red, a mix of embarassement and rage.", "Сара раскрыв руки, снова обнажила свои половые органы. Её лицо покраснело — это была смесь смущения и гнева.", ["Сара"]],
  ["wet-sex", "Sarah felt Lily's fingers slide down her stomach, past her legs, then pressing upon her wet sex.", "Сара почувствовала, как пальцы Лили скользнули вниз по её животу, прошли мимо ног, а затем коснулись её влажных половых органов.", ["Лили"]],
  ["anus", "His thumb pressed against her anus, slow and deliberate.", "Его большой палец надавил на её анус, медленно и нарочито.", []],
  ["erection-2", "She could feel his erection pressing against her thigh.", "Она чувствовала, как его эрекция прижимается к её бедру.", []],
  ["clean-control", "Sarah felt her heart race as he stepped closer.", "Сердце Сары забилось чаще, когда он шагнул ближе.", []],
  ["clean-control-2", "He looked at her with a tired, knowing smile.", "Он посмотрел на неё с усталой, понимающей улыбкой.", []],
] as const;

const hasClinical = (s: string): string[] => CLINICAL.filter((t) => s.toLowerCase().includes(t));

async function chat(system: string, user: string): Promise<string> {
  const r = await fetch("http://127.0.0.1:8080/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen3.6-35b-a3b-ud-q4_k_xl",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
      max_tokens: 300,
      stream: false,
      reasoning_effort: "none",
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return d.choices?.[0]?.message?.content?.trim() ?? "";
}

for (const [tag, en, ru, names] of CASES) {
  const out = await chat(SYSTEM_D, `SOURCE (en): ${en}\nTRANSLATION (ru): ${ru}`);
  const left = hasClinical(out);
  const latin = /[A-Za-z]{2,}/.test(out) ? "ЛАТИНИЦА" : "";
  const lostName = (names as readonly string[]).filter((n) => !out.includes(n)).join(",");
  const ratio = (out.length / ru.length).toFixed(2);
  const verdict = [left.length ? `КЛИНИКА: ${left.join(",")}` : "клиники нет", latin, lostName ? `ПОТЕРЯНО ИМЯ: ${lostName}` : "", `len×${ratio}`]
    .filter(Boolean)
    .join(" | ");
  console.log(`### ${tag}  [${verdict}]`);
  console.log(`  было: ${ru}`);
  console.log(`  стало: ${out}\n`);
}
