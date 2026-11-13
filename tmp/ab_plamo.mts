/**
 * ab_plamo.mts — A/B-проба PLaMo 3 Translate в её родном формате (PFML3 через
 * system-сообщение `[plamo-translate]`), тем же списком строк, что tone_native.
 * Пишет лог в формате tone_native, чтобы работал tmp/ab_compare.mts.
 *
 * Запуск: PLAMO_MODEL="plamo-3-translate-8b@q4_k_m" node tmp/ab_plamo.mts
 */
import { readFileSync, writeFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { buildNameCanon, nameGlossary } from "../.opencode/skills/translate/judge_client.mts";

const BASE = process.env.TSSR_LLM_URL ?? "http://127.0.0.1:1234";
const MODEL = process.env.PLAMO_MODEL ?? "plamo-3-translate-8b@q4_k_m";
const LANG = "ru";
const CONC = 4;
const SAMPLE = "tmp/ab_sample.txt";
const OUT = process.env.PLAMO_LOG ?? "tmp/ab_plamo.log";

const entries = parsePo(readFileSync(`patches/ai-voice-pack/po/${LANG}.po`, "utf-8").replace(/\r\n/gu, "\n")).filter(
  (e) => e.msgid,
);
const canon = buildNameCanon(entries);
const byIdx = (i: number) => entries[i]!;
const idxs = readFileSync(SAMPLE, "utf-8")
  .split(/\s+/u)
  .filter(Boolean)
  .map(Number);

/** Контекст — PLaMo понимает его как reference context, не как приказ. */
const CONTEXT =
  "An 18+ dark fantasy novel. Narration is close third person, sensual and direct; " +
  "dialogue is colloquial and blunt. Keep the same register, no bureaucratic or medical wording.";

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter((w) => w.length > 1);
function f1(a: string, b: string): number {
  const wa = words(a);
  const wb = new Set(words(b));
  if (!wa.length || !wb.size) return 0;
  const hit = wa.filter((w) => wb.has(w)).length;
  const p = hit / wa.length;
  const r = hit / wb.size;
  return p + r === 0 ? 0 : +((2 * p * r) / (p + r)).toFixed(3);
}

function systemFor(target: string, source: string, glossary: string[], context: string): string {
  const lines = ["[plamo-translate]", `target_lang=${target}`, `source_lang=${source}`];
  for (const g of glossary) {
    const [src, dst] = g.split("→");
    if (src && dst) lines.push(`glossary=${src} => ${dst}`);
  }
  lines.push("---", context);
  return lines.join("\n");
}

async function call(system: string, user: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${BASE.replace(/\/+$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0,
          max_tokens: 512,
          stream: false,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const s = d.choices?.[0]?.message?.content?.trim() ?? "";
      if (s) return s;
    } catch {
      /* retry */
    }
  }
  return null;
}

const log: string[] = [];
let cursor = 0;
let done = 0;
const t0 = Date.now();

async function lane(): Promise<void> {
  for (;;) {
    const k = cursor++;
    if (k >= idxs.length) return;
    const idx = idxs[k]!;
    const e = byIdx(idx);
    const names = nameGlossary(e.msgid, canon);
    const neu = await call(systemFor("ru", "en", names, CONTEXT), e.msgid);
    let back: string | null = null;
    let score: number | undefined;
    if (neu) {
      back = await call(systemFor("en", "ru", [], ""), neu);
      if (back) score = f1(e.msgid, back);
    }
    done += 1;
    log.push(
      `### [${done}/${idxs.length}] idx ${idx} ${neu ? "ок" : "✗"}${score !== undefined ? ` f1=${score}` : ""}\n` +
        `  EN:  ${e.msgid}\n  было: ${e.msgstr}\n  стало: ${neu ?? ""}\n` +
        (back ? `  обратно: ${back}\n` : "") +
        "\n",
    );
    console.log(`[${done}/${idxs.length}] idx ${idx} ${neu ? "ок" : "✗"}${score !== undefined ? ` f1=${score}` : ""}`);
  }
}

await Promise.all(Array.from({ length: CONC }, () => lane()));
writeFileSync(OUT, log.join(""), "utf-8");
const withScore = log.filter((l) => l.includes("f1="));
console.log(`\nитог: ${done} строк, ${withScore.length} с F1, ${((Date.now() - t0) / 1000).toFixed(1)} с, лог ${OUT}`);
