/** Воспроизведение бага «Король Оруэлл\nОх, Сара...» — точный промпт раннера. */
import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const skill = readFileSync(".opencode/skills/translate/SKILL.md", "utf-8");
const rules = skill.slice(skill.indexOf("<!-- ПРАВИЛА -->") + 15, skill.indexOf("<!-- /ПРАВИЛА -->")).trim();
const entries = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);
const i = entries.findIndex((e) => e.msgid.startsWith("Ooh, Sarah, my back!"));
const e = entries[i];
const at = (k: number): string | null => { const x = entries[i + k]; return x ? `${x.msgctxt} ${x.msgid}` : null; };
const ctx = [-3, -2, -1, 1].map(at).filter((x): x is string => Boolean(x));
const user = (ctx.length ? `CONTEXT (previous/next lines — understanding only, translate ONLY the target):\n${ctx.join("\n")}\n\n` : "") +
  `Said by: ${e.msgctxt.replace(/^speaker:/, "")} (gender M)\nEN: ${e.msgid}\n\n` +
  `Translate ONLY the EN line into Russian. The value of "tr" must contain the translation and NOTHING ELSE: ` +
  `no speaker name, no label, no line breaks. Output ONLY JSON {"tr":"<translation>"}.`;
console.log("=== КОНТЕКСТ, который видит модель ===");
console.log(ctx.join("\n"));
console.log("=== 3 прогона одного и того же промпта ===");
for (let n = 0; n < 3; n++) {
  const r = await fetch("http://127.0.0.1:8080/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "qwen3.6-35b-a3b-ud-q4_k_xl", messages: [{ role: "system", content: `You translate this game into Russian. Follow these rules:\n\n${rules}` }, { role: "user", content: user }], temperature: 0.5, max_tokens: 700, stream: false, reasoning_effort: "none" }),
    signal: AbortSignal.timeout(120000),
  });
  const d = (await r.json()) as any;
  const raw = d.choices?.[0]?.message?.content ?? "";
  const m = /"tr"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw);
  let tr = m ? m[1] : raw;
  try { tr = JSON.parse(`"${m[1]}"`) as string; } catch {}
  console.log(`[${n + 1}] ${JSON.stringify(tr).slice(0, 160)}`);
}
