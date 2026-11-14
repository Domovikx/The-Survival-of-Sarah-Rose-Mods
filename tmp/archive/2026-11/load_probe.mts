/** Воспроизведение отказа: РЕАЛЬНЫЕ промпты судьи, 8 параллельно, волной. */
import { readFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { judgeSystem, judgeUser } from "../.opencode/skills/renpy-po/po_translate.mts";
import { potIndex } from "../.opencode/skills/renpy-po/pot_resolve.mts";

const MODEL = "qwen/qwen3.5-9b";
const BASE = "http://127.0.0.1:1234/v1";

const entries = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid && e.msgstr.trim(),
);
// реальные строки разной длины (середина файла)
const sample = entries.filter((e) => e.msgid.length > 40 && e.msgid.length < 300).slice(20000, 20040);

let ok = 0;
let fail = 0;
const errs = new Map<string, number>();

const one = async (e: (typeof entries)[0]): Promise<void> => {
  const i = entries.indexOf(e);
  const prev = [entries[i - 3], entries[i - 2], entries[i - 1]]
    .filter(Boolean)
    .map((x) => `${x.msgctxt} ${x.msgid}`);
  const sys = judgeSystem(e.msgctxt);
  const usr = judgeUser("ru", e, e.msgstr, potIndex().emotion(e.msgctxt, e.msgid), prev);
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: usr },
        ],
        temperature: 0.1,
        max_tokens: 900,
        stream: false,
        reasoning_effort: "none",
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const d = (await r.json()) as { choices?: unknown[]; error?: { error?: string } };
    if (r.ok && d.choices) ok++;
    else {
      fail++;
      const msg = `${r.status} ${JSON.stringify(d.error ?? d).slice(0, 140)}`;
      errs.set(msg, (errs.get(msg) ?? 0) + 1);
    }
  } catch (e2) {
    fail++;
    const msg = `EXC ${String(e2).slice(0, 120)}`;
    errs.set(msg, (errs.get(msg) ?? 0) + 1);
  }
};

console.log(`реальных строк: ${sample.length}, промпт ~${Math.round((judgeSystem("speaker:Narrator").length + 3000) / 3.6)} ток`);
const t0 = Date.now();
// волна 1: 8 параллельно; волна 2: следующие 8; ...
for (let w = 0; w < sample.length; w += 8) {
  await Promise.all(sample.slice(w, w + 8).map((e) => one(e)));
}
console.log(`за ${((Date.now() - t0) / 1000).toFixed(1)}с: ok ${ok} | fail ${fail}`);
for (const [m, n] of [...errs.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n}× ${m}`);
