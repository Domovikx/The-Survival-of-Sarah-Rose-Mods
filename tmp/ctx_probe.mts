/** Проба: сколько токенов реально влезает в один запрос (параллелизм 8). */
const BASE = "http://127.0.0.1:1234/v1";
const MODEL = "qwen/qwen3.5-9b";

const ask = async (tokens: number): Promise<string> => {
  const filler = "word ".repeat(tokens);
  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: "system", content: "You are a QA reviewer. Answer briefly." },
      { role: "user", content: `${filler}\nReply with OK only.` },
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
    const d = (await r.json()) as { error?: { error?: string } };
    if (r.ok && !d.error) return "OK";
    return `FAIL ${r.status}: ${JSON.stringify(d.error ?? d).slice(0, 220)}`;
  } catch (e) {
    return `EXC ${String(e).slice(0, 160)}`;
  }
};

for (const n of [1000, 2000, 3000, 5000, 8000, 16000]) {
  const res = await ask(n);
  console.log(`~${String(n).padStart(6)} токенов -> ${res}`);
}
