/** По одному запросу: реальный промпт судьи, последовательно. */
import { readFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { judgeSystem, judgeUser } from "../.opencode/skills/renpy-po/po_translate.mts";
import { potIndex } from "../.opencode/skills/renpy-po/pot_resolve.mts";

const entries = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid && e.msgstr.trim(),
);
const e = entries.find((x) => x.msgid.length > 100 && x.msgid.length < 200)!;
const i = entries.indexOf(e);
const prev = [entries[i - 3], entries[i - 2], entries[i - 1]]
  .filter(Boolean)
  .map((x) => `${x.msgctxt} ${x.msgid}`);

const sys = judgeSystem(e.msgctxt);
const usr = judgeUser("ru", e, e.msgstr, potIndex().emotion(e.msgctxt, e.msgid), prev);
console.log(`система: ${sys.length} симв., юзер: ${usr.length} симв., всего ${sys.length + usr.length}`);

const send = async (label: string, system: string, user: string, maxTokens: number): Promise<void> => {
  const r = await fetch("http://127.0.0.1:1234/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen/qwen3.5-9b",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
      max_tokens: maxTokens,
      stream: false,
      reasoning_effort: "none",
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const d = (await r.json()) as { choices?: unknown[]; error?: { error?: string } };
  console.log(
    `  ${label}: ${r.ok && d.choices ? "OK" : `FAIL ${r.status} ${JSON.stringify(d.error ?? d).slice(0, 130)}`}`,
  );
};

await send("1) реальный промпт, max_tokens=900", sys, usr, 900);
await send("2) реальный промпт, max_tokens=100", sys, usr, 100);
await send("3) только юзер (без системы)", "", usr, 900);
await send("4) только система", sys, "Reply OK", 900);
await send("5) пустая система + длинный юзер", "", usr, 900);
