/**
 * tmp/tone_probe.mts — эксперимент: как поднять регистр озвучки в переводе.
 *
 * Сравниваем на реальных строках po/ru.po три конфигурации:
 *   A) текущие МИКРО-ПРАВИЛА из SKILL.md (как переводит сейчас),
 *   B) они же + правило про анатомию/регистр (кандидат в скилл),
 *   C) «редактор»: переписать ГОТОВЫЙ перевод, убрав медицинщину.
 *
 * Запуск: node tmp/tone_probe.mts
 */

import { readFileSync } from "node:fs";

const SKILL = readFileSync(".opencode/skills/translate/SKILL.md", "utf-8");
const RULES = SKILL.slice(SKILL.indexOf("<!-- ПРАВИЛА -->") + "<!-- ПРАВИЛА -->".length, SKILL.indexOf("<!-- /ПРАВИЛА -->")).trim();

const TONE_RULE = `
8. Анатомия и близость — языком жанра, а не медицины и не канцелярита:
   никаких «половые органы», «влагалище», «пенис», «промежность», «анус»,
   «эякуляция», «эрекция», «половой акт», «мастурбация», «гениталии».
   Пиши так, как пишут эротическую прозу: образно и плотски, с тем же
   жаром, что в оригинале. Регистр берётся из оригинала и не выравнивается:
   мягкое описание остаётся мягким, грубое — грубым. Если по-другому
   выходит неловко или стыдливо — лучше образ, чем термин.
`.trim();

const SYSTEM_B = `You translate this game into Russian. Follow these rules:\n\n${RULES}\n\n${TONE_RULE}`;

const SYSTEM_C = `You are a Russian literary editor of 18+ erotic prose. You get a source line (en) and its Russian translation, which is correct in meaning but sometimes sounds clinical (medical/anatomical) instead of literary. Rewrite the Russian line so it reads like an author writing erotic prose of that intensity: the same meaning, the same facts, the same intensity, the same POV and gender — but no clinical vocabulary (половые органы, влагалище, пенис, промежность, анус, эякуляция, эрекция, половой акт). If the source is soft and euphemistic, the Russian stays soft and euphemistic; if the source is crude, the Russian is just as crude. Keep character names as they are in the Russian line. Do not add or drop anything, do not explain. Output ONLY the rewritten Russian line.`;

type Case = { tag: string; en: string; ru: string };

const CASES: Case[] = [
  {
    tag: "owner-example",
    en: "With her arms now tied behind her back, she almost seemed to be presenting herself, her breasts sticking out, her sex uncovered.",
    ru: "Теперь, когда её руки были связаны за спиной, казалось, будто она сама себя представляет: грудь выпирала вперёд, а половые органы оставались открытыми.",
  },
  {
    tag: "fingers-into-sex",
    en: "Kate began to slowly push two fingers into Sarah's sex.",
    ru: "Кейт начала медленно вводить два пальца во влагалище Сары.",
  },
  {
    tag: "cock-into-pussy",
    en: "Varga put one hand on his own cock, and slowly guided it into Sarah's pussy, gently pushing into her.",
    ru: "Варга положил одну руку на свой член и медленно ввёл его во влагалище Сары, нежно проникая внутрь.",
  },
  {
    tag: "erection",
    en: "He waved his erection from side to side.",
    ru: "Он размахивал своей эрекцией из стороны в сторону.",
  },
  {
    tag: "between-legs",
    en: "Her eyes drifted down to between Kate's legs.",
    ru: "Её глаза соскользнули ниже — к промежности Кейт.",
  },
  {
    tag: "exposed-her-sex",
    en: "Sarah unclapsed her hands and exposed her sex again. Her face red, a mix of embarassement and rage.",
    ru: "Сара раскрыв руки, снова обнажила свои половые органы. Её лицо покраснело — это была смесь смущения и гнева.",
  },
  {
    tag: "wet-sex",
    en: "Sarah felt Lily's fingers slide down her stomach, past her legs, then pressing upon her wet sex.",
    ru: "Сара почувствовала, как пальцы Лили скользнули вниз по её животу, прошли мимо ног, а затем коснулись её влажных половых органов.",
  },
  {
    tag: "ass (control)",
    en: "She sat on the edge of the bed, her ass still sore.",
    ru: "Она села на край кровати, задница всё ещё болела.",
  },
  {
    tag: "clean (control)",
    en: "Sarah felt her heart race as he stepped closer.",
    ru: "Сердце Сары забилось чаще, когда он шагнул ближе.",
  },
];

const MODEL = "qwen3.6-35b-a3b-ud-q4_k_xl";

async function chat(system: string, user: string, temp = 0, maxTokens = 400): Promise<string> {
  const r = await fetch("http://127.0.0.1:8080/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: temp,
      max_tokens: maxTokens,
      stream: false,
      reasoning_effort: "none",
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return d.choices?.[0]?.message?.content?.trim() ?? "(пусто)";
}

/** A/B: перевод с нуля (нужен JSON {"scene","tr"} — берём tr). */
function tr(json: string): string {
  const m = /"tr"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(json);
  return m ? m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') : json;
}

const rows: string[] = [];
for (const c of CASES) {
  const user = `TRANSLATE ONLY the target line.\nEN: ${c.en}`;
  const a = tr(await chat(`You translate this game into Russian. Follow these rules:\n\n${RULES}`, user));
  const b = tr(await chat(SYSTEM_B, user));
  const cc = await chat(SYSTEM_C, `SOURCE (en): ${c.en}\nTRANSLATION (ru): ${c.ru}`);
  rows.push([`### ${c.tag}`, `EN: ${c.en}`, `RU сейчас: ${c.ru}`, `A (текущие правила): ${a}`, `B (+правило регистра): ${b}`, `C (редактор готового): ${cc}`, ""].join("\n"));
  console.log(rows.at(-1));
}
console.log("\n=== все кейсы выше ===");
