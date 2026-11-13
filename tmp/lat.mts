const sys = `You are a literary editor of 18+ prose in Russian. You get one SOURCE line (English), its TRANSLATION (Russian) and TERM.
Return JSON only: {"fragment": "...", "replacement": "..."}
- "fragment" is an EXACT substring of the translation. It must cover TERM and every other word that has to change with it.
- "replacement" rewrites exactly that span as prose.`;
const user = `SOURCE (en): Kate began to slowly push two fingers into Sarah's sex.
TRANSLATION (ru): Кейт начала медленно вводить два пальца во влагалище Сары.
TERM (exact text as it stands): влагалище
WHY IT IS WRONG: clinical, reads like a medical report`;

for (const [label, url, model] of [
  ["strata", "http://127.0.0.1:8080", "qwen3.6-35b-a3b-ud-q4_k_xl"],
] as Array<[string, string, string]>) {
  for (const temp of [0, 0.4]) {
    const t0 = Date.now();
    const r = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: temp,
        max_tokens: 260,
        stream: false,
        reasoning_effort: "none",
      }),
      signal: AbortSignal.timeout(300_000),
    });
    const d = (await r.json()) as { usage?: { completion_tokens?: number }; choices?: Array<{ message?: { content?: string } }> };
    console.log(`${label} temp=${temp}: ${((Date.now() - t0) / 1000).toFixed(1)}s, out=${d.usage?.completion_tokens}, ${(d.choices?.[0]?.message?.content ?? "").slice(0, 120)}`);
  }
}
