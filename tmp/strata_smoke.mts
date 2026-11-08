/** Strata smoke + micro-benchmark: /v1/chat/completions, UTF-8 без кракозябр. */
const URL_BASE = process.env.STRATA_URL ?? "http://127.0.0.1:8080";
const MODEL = process.env.STRATA_MODEL ?? "qwen3.6-35b-a3b-ud-q4_k_xl";

interface ChatResp {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

async function chat(
  content: string,
  maxTokens = 300,
): Promise<{ text: string; sec: number; tok: number }> {
  const t0 = performance.now();
  const r = await fetch(`${URL_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content }],
      max_tokens: maxTokens,
    }),
  });
  const sec = (performance.now() - t0) / 1000;
  const j = (await r.json()) as ChatResp;
  if (j.error) throw new Error(j.error.message);
  const text = j.choices?.[0]?.message?.content ?? "";
  return { text, sec, tok: j.usage?.completion_tokens ?? 0 };
}

const label = process.argv[2] ?? "smoke";
const prompt =
  process.argv[3] ??
  'Ответь одним словом (на русском): какой цвет у неба днём? Только слово, без пояснений.';

const res = await chat(prompt, label === "smoke" ? 50 : 600);
const tps = res.tok && res.sec > 0 ? (res.tok / res.sec).toFixed(1) : "?";
console.log(`[${label}] ${res.sec.toFixed(1)}s, tokens=${res.tok}, tok/s=${tps}`);
console.log(res.text.trim().slice(0, 500));
