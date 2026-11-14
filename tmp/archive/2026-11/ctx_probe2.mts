/** Проба 2: 8 параллельных запросов ~2500 токенов — как в реальном прогоне. */
const BASE = "http://127.0.0.1:1234/v1";
const MODEL = "qwen/qwen3.5-9b";

const ask = async (i: number, tokens: number): Promise<string> => {
  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: "system", content: "You are a QA reviewer. Answer briefly." },
      { role: "user", content: `${"word ".repeat(tokens)}\nReply with OK only.` },
    ],
    max_tokens: 900,
    stream: false,
    reasoning_effort: "none",
  });
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(60_000),
    });
    const d = (await r.json()) as { error?: unknown; choices?: unknown[] };
    if (r.ok && d.choices) return `req${i}: OK`;
    return `req${i}: FAIL ${r.status} ${JSON.stringify(d.error ?? d).slice(0, 180)}`;
  } catch (e) {
    return `req${i}: EXC ${String(e).slice(0, 120)}`;
  }
};

for (const tokens of [2500, 4000]) {
  console.log(`--- 8 параллельных запросов по ~${tokens} токенов ---`);
  const res = await Promise.all(Array.from({ length: 8 }, (_, i) => ask(i + 1, tokens)));
  for (const r of res) console.log("  ", r);
}
