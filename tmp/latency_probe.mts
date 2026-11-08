/** Сколько реально стоит один перевод: префилл + генерация. */
import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const skill = readFileSync(".opencode/skills/translate/SKILL.md", "utf-8");
const rules = skill.slice(skill.indexOf("<!-- ПРАВИЛА -->") + 15, skill.indexOf("<!-- /ПРАВИЛА -->")).trim();
const entries = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((e) => e.msgid);
const samples = entries.filter((e) => e.msgctxt.startsWith("speaker:") && e.msgid.length > 80).slice(500, 504);
for (const e of samples) {
  const body = JSON.stringify({
    model: "qwen3.6-35b-a3b-ud-q4_k_xl",
    messages: [
      { role: "system", content: `You translate this game into Russian. Follow these rules:\n\n${rules}` },
      { role: "user", content: `speaker: ${e.msgctxt}\nEN: ${e.msgid}\n\nTranslate into Russian. Output ONLY JSON {"tr":"<translation>"}.` },
    ],
    temperature: 0.5, max_tokens: 700, stream: false, reasoning_effort: "none",
  });
  const t0 = Date.now();
  const r = await fetch("http://127.0.0.1:8080/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(120000) });
  const d = (await r.json()) as any;
  const ms = Date.now() - t0;
  const u = d.usage ?? {};
  console.log(`${ms} мс | prompt ${u.prompt_tokens} comp ${u.completion_tokens} (reasoning ${u.completion_tokens_details?.reasoning_tokens}) | finish=${d.choices?.[0]?.finish_reason}`);
}
