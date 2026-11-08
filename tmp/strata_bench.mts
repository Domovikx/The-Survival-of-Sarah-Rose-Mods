/** Strata micro-benchmark: перевод 10 реальных строк EN→ES одним запросом (как po:translate). */
const URL_BASE = process.env.STRATA_URL ?? "http://127.0.0.1:8080";
const MODEL = process.env.STRATA_MODEL ?? "qwen3.6-35b-a3b-ud-q4_k_xl";

const LINES = [
  '"Ooh no, not this one, try that one" she would say when Sarah was still small.',
  "'A preliminary Analysis on Snow Crystal as an Alchemical Catalyst.'",
  "'The Desert Blooms'. We have Thirty-eight copies within the current inventory.",
  "A Queen with no crown. A Queen with no throne. A Queen with no land.",
  "A bead of sweat fell from Naydeen's face, landing on Sarah's stomach.",
  "A black liquid spewed out, covering part of her face and armor, and the beast roared again.",
  "A Brief Investigation on Ethics was first written by the philosopher Lu-Fan, hailing from the current region known to you as the Far East.",
  "A Tribesmen, caught from his horse, was far less of a threat.",
  "A black, oily tongue, emerged from its mouth, sliding around the body of the Mythran prince, and dragging it into its bowels.",
  "A hundred men would die tonight, and he would be one of them.",
];

const TARGET = process.argv[2] ?? "Spanish";
const NO_THINK = process.argv[3] === "--nothink";

const numbered = LINES.map((l, i) => `${i + 1}. ${l}`).join("\n");
const prompt = `You are a professional game translator. Translate each numbered line from English to ${TARGET}. Keep the numbering, keep quotes. Output ONLY the numbered translations, nothing else.

${numbered}`;

interface ChatResp {
  choices?: Array<{ message?: { content?: string | null; reasoning_content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
  error?: { message?: string };
}

const body: Record<string, unknown> = {
  model: MODEL,
  messages: [{ role: "user", content: prompt }],
  max_tokens: 4000,
};
if (NO_THINK) {
  // Strata: thinking:{type:"disabled"}; LM Studio qwen3.5: reasoning_effort:"none"
  // (единственный рабочий способ, см. po_translate.mts — ловушка lmstudio#1990).
  body.thinking = { type: "disabled" };
  body.reasoning_effort = "none";
}

const t0 = performance.now();
const r = await fetch(`${URL_BASE}/v1/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const sec = (performance.now() - t0) / 1000;
const j = (await r.json()) as ChatResp;
if (j.error) {
  console.error("ERROR:", j.error.message);
  process.exit(1);
}
const msg = j.choices?.[0]?.message ?? {};
const content = msg.content ?? "";
const reasoning = msg.reasoning_content ?? "";
const ct = j.usage?.completion_tokens ?? 0;
const rt = j.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
const answerTokens = Math.max(ct - rt, 0);

console.log(`=== ${MODEL} → ${TARGET}${NO_THINK ? " (thinking disabled)" : ""} ===`);
console.log(`wall: ${sec.toFixed(1)}s | completion: ${ct} tok (reasoning ${rt}, answer ${answerTokens})`);
console.log(`answer tok/s: ${(answerTokens / sec).toFixed(1)} | all tok/s: ${(ct / sec).toFixed(1)}`);
console.log(`prompt: ${j.usage?.prompt_tokens} tok | finish: ${j.choices?.[0]?.finish_reason}`);
console.log("--- ANSWER ---");
console.log(content.trim().slice(0, 2500));
if (reasoning) console.log(`--- (reasoning: ${reasoning.length} chars, skipped) ---`);
