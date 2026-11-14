/** 8 параллельных реальных запросов: параллелит ли Strata? */
import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const skill = readFileSync(".opencode/skills/translate/SKILL.md", "utf-8");
const rules = skill.slice(skill.indexOf("<!-- ПРАВИЛА -->") + 15, skill.indexOf("<!-- /ПРАВИЛА -->")).trim();
const entries = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((e) => e.msgid);
const samples = entries.filter((e) => e.msgctxt.startsWith("speaker:") && e.msgid.length > 80).slice(600, 624);
const one = async (e: (typeof samples)[0]): Promise<number> => {
  const t0 = Date.now();
  const r = await fetch("http://127.0.0.1:8080/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "qwen3.6-35b-a3b-ud-q4_k_xl", messages: [
      { role: "system", content: `You translate this game into Russian. Follow these rules:\n\n${rules}` },
      { role: "user", content: `Said by: ${e.msgctxt.replace(/^speaker:/, "")}\nEN: ${e.msgid}\n\nTranslate ONLY the EN line. Output ONLY JSON {"tr":"<translation>"}.` },
    ], temperature: 0.5, max_tokens: 700, stream: false, reasoning_effort: "none" }),
    signal: AbortSignal.timeout(120000),
  });
  await r.json();
  return Date.now() - t0;
};
const t0 = Date.now();
const times = await Promise.all(samples.map((e) => one(e)));
const wall = Date.now() - t0;
console.log(`поштучно: ${times.join(", ")} мс`);
console.log(`стеной ${wall} мс на ${samples.length} запросов → ${(samples.length / (wall / 1000)).toFixed(2)} стр/с`);
console.log(`если бы сериализованно: ${times.reduce((a, b) => a + b, 0)} мс`);
