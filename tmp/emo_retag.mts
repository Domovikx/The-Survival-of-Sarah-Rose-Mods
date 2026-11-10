/**
 * emo_retag.mts — точечный пере-тегинг тона с обратной связью судьи
 * (шаг лечения флагов волны 1b, задача 2026-11-10).
 *
 * Для каждой строки из фикс-листа: LLM генерирует НОВЫЙ тон (спек скилла
 * emotion-tag) с учётом причин отклонения судьи; формат валидируется
 * (2-6 английских слов, с заглавной) с 2 ретраями. Результат — черновик
 * tmp/emotions_tagged.json (дальше: npm run potgen -- --emotions <файл>).
 *
 * Запуск: node tmp/emo_retag.mts [tmp/emo_fixlist_tight.json]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { voicedEntries } from "../patches/ai-voice-pack/tools/generate/scripts/emotion_tag.mts";
import { resolveBackend } from "../scripts/llm_backend.mts";

const LIST = process.argv[2] ?? "tmp/emo_fixlist_tight.json";
const OUT = "tmp/emotions_tagged.json";
const backend = resolveBackend();
const baseUrl = process.env.LLM_URL ?? backend.url;
const model = process.env.LLM_MODEL ?? backend.model;

interface FixItem {
  uid: string;
  speaker: string;
  scene: string | null;
  old_ton: string;
  issues: string;
  en: string;
}

const SPEC =
  "You write voice-direction TONE instructions (\"ton\") for an adult visual novel.\n" +
  "RULES (the ton must satisfy ALL):\n" +
  "1. English, 2-6 words, one line, Capitalized, no quotes.\n" +
  "2. A description of the speaker's delivery state (not a command): emotion words ARE fine " +
  "(\"Weary and resigned\", \"Softly intimate\").\n" +
  "3. It is the state of the SPEAKER (or the Narrator-as-storyteller) AS they deliver THIS line.\n" +
  "4. Never retell the line's content; never a narrative-function label; never physical-action cues.\n" +
  "5. It must match THIS line, its scene and the speaker.\n" +
  'Output STRICT JSON only: {"ton":"<2-6 words>"}. No text outside the JSON.';

const fmtOk = (t: string): boolean =>
  /^[A-Z][a-zA-Z,' -]*$/.test(t) && t.trim().split(/\s+/).length >= 2 && t.trim().split(/\s+/).length <= 6;

async function ask(user: string): Promise<string> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SPEC },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_tokens: 120,
      reasoning_effort: "none",
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const m = /"ton"\s*:\s*"([^"]+)"/.exec(d.choices?.[0]?.message?.content ?? "");
  return m ? m[1]! : "";
}

const byUid = new Map(voicedEntries().map((e) => [e.uid, e]));
const list = JSON.parse(readFileSync(LIST, "utf-8")) as FixItem[];
const draft = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf-8")) as Record<string, string>) : {};

let fixed = 0;
for (const f of list) {
  const e = byUid.get(f.uid);
  if (!e) continue;
  const user =
    `Speaker: ${f.speaker}${f.scene ? ` | scene: ${f.scene}` : ""}\n` +
    `SOURCE (EN): ${f.en}\n` +
    `PREVIOUS ton was REJECTED: "${f.old_ton}" — ${f.issues}\n` +
    `Write a corrected ton that fixes ONLY this problem and matches the line.`;
  let ton = "";
  for (let attempt = 0; attempt < 3 && !fmtOk(ton); attempt++) ton = await ask(user + (attempt ? `\nPrevious output "${ton}" violated the format rules. Fix the format.` : ""));
  if (!fmtOk(ton)) {
    console.log(`ПРОПУСК ${f.uid}: формат не вышел (${ton})`);
    continue;
  }
  draft[f.uid] = ton;
  fixed++;
  console.log(`  ${f.uid.slice(0, 8)} «${f.old_ton}» → «${ton}»`);
}
writeFileSync(OUT, JSON.stringify(draft, null, 1));
console.log(`итого пере-тегировано: ${fixed}/${list.length} → ${OUT}`);
