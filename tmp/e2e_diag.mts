// Диагностика E2E: что модель реально возвращает на отклонённых строках.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { systemPrompt } from "../.opencode/skills/renpy-po/po_translate.mts";

const REPO = process.cwd();
const LANGS = ["de", "ja", "ko"];

function rejected(lang: string, limit: number): string[] {
  const f = join(REPO, "tmp", `po_translate_${lang}.jsonl`);
  if (!existsSync(f)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const lines = readFileSync(f, "utf-8").split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    let r: { rejected?: boolean; error?: unknown; msgid?: string; issues?: string[] };
    try {
      r = JSON.parse(lines[i]) as typeof r;
    } catch {
      continue;
    }
    if (!r.rejected || r.error || !r.msgid || r.msgid.length < 30 || r.msgid.length > 150) continue;
    if (seen.has(r.msgid)) continue;
    seen.add(r.msgid);
    out.push(r.msgid);
  }
  return out;
}

for (const lang of LANGS) {
  const po = readFileSync(join(REPO, "patches/ai-voice-pack/po", `${lang}.po`), "utf-8");
  const ents = parsePo(po.replace(/\r\n/g, "\n")).filter((e) => e.msgid);
  const sys = systemPrompt(lang);
  console.log(`\n########## ${lang} | промпт ${sys.length} симв ##########`);
  for (const msgid of rejected(lang, 3)) {
    const entry = ents.find((e) => e.msgid === msgid);
    if (!entry) continue;
    const res = await fetch("http://127.0.0.1:1234/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen/qwen3.5-9b",
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: `category: ${entry.msgctxt} — interface/speech\nEN: ${entry.msgid}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 300,
        reasoning_effort: "none",
      }),
    });
    const d = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = d.choices?.[0]?.message?.content ?? "(пусто)";
    console.log(`\nEN: ${msgid.slice(0, 90)}`);
    console.log(`TR: ${raw.replace(/\s+/g, " ").slice(0, 220)}`);
  }
}
