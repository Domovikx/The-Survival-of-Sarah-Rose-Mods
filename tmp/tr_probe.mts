const cases: Array<[string, string]> = [
  ["16553", "Your pussy won't be ready just yet, so for now, you can just use your mouth."],
  ["16097", "Between her legs, Sarah felt her sex burn and her wetness run past her own legs."],
  ["15984", "Like this, her sex was exposed to him, not that there was much vanity left to save."],
  ["45728", "Pressing her lips up against Eula's sex, she felt Eula's body jolt at the contact."],
  ["18159", "With a circling motion, Belmont reamed the edge of her asshole with the bar of soap."],
];

const prompt = (en: string) => `请将以下英文小说文本翻译成俄语，并且严格遵循所有约束要求。

【源文】
${en}

【约束要求】
1. 【硬性要求】术语对照: pussy→киска、cunt→киска、cock→член、ass→задница、sex→между ног
2. 【注意】18+ 文学小说的俄语风格：口语化、直白、具体，不要用医学或公文用语（влагалище、половые органы）
3. 【注意】保持人名不变，只输出译文

只输出译文，不要有任何额外说明。`;

for (const [id, en] of cases) {
  const t0 = Date.now();
  const r = await fetch("http://127.0.0.1:1234/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "index-translate-9b",
      messages: [{ role: "user", content: prompt(en) }],
      temperature: 0,
      max_tokens: 400,
      chat_template_kwargs: { enable_thinking: false },
    }),
  });
  const d = (await r.json()) as any;
  const out = (d.choices?.[0]?.message?.content ?? "").trim();
  console.log(`[${id}] ${((Date.now() - t0) / 1000).toFixed(1)}s\n  EN: ${en}\n  RU: ${out}\n`);
}
