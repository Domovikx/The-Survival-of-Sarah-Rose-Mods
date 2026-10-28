/**
 * emotion_judge.mts — судья-выборка тона (ШАГ 4 скилла emotion-tag).
 *
 * `po:judge` судит ПЕРЕВОДЫ (msgstr vs msgid); здесь другая задача:
 * подходит ли ИНСТРУКЦИЯ ДИКТОРА (`#. emotion:`) конкретной строке —
 * смыслу фразы, спикеру и сцене.
 *
 * Запуск:
 *   node emotion_judge.mts                     # 20 случайных из черновика
 *   node emotion_judge.mts --n 40 --pot        # выборка из POT (текущий тон)
 *   node emotion_judge.mts --threshold 8       # порог принятия (по умолч. 8)
 *   node emotion_judge.mts --uid u1 u2         # точечная проверка
 *
 * Выборка stride (каждый k-й) — детерминирована и покрывает весь файл.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { EMOTIONS_JSON, voicedEntries } from "./emotion_tag.mts";
import type { CatalogEntry } from "./voice_batch.mts";

export const JUDGE_SYSTEM =
  "You are a voice-direction QA reviewer for an adult visual novel. You get ONE game line " +
  "(source EN, speaker, arc/scene, neighbours) and the DELIVERY instruction (ton) chosen for it.\n\n" +
  "Score 0-10 how well the ton fits:\n" +
  "- 9-10: an English delivery state of THIS speaker in THIS moment; 2-6 words; matches the line's emotion.\n" +
  "- 5-8: plausible but generic, off-key for the moment, or describing the content instead of the delivery.\n" +
  "- 0-4: contradicts the line/scene, is not a delivery state at all, wrong language, or broken format.\n\n" +
  'Output STRICT JSON only: {"score":<0-10 int>,"issues":["...", ...]}. Each issue max 12 words; [] if good. ' +
  "No text outside the JSON.";

export interface ToneVerdict {
  score: number;
  issues: string[];
}

/** JSON-вердикт из сырого ответа (чистая — тестируется). */
export function parseToneVerdict(raw: string): ToneVerdict {
  const m = /"score"\s*:\s*"?(\d+(?:\.\d+)?)/.exec(raw);
  const im = /"issues"\s*:\s*\[([\s\S]*?)\]/.exec(raw);
  const issues = im ? ([...im[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]) as string[]) : [];
  return { score: m ? Number(m[1]) : -1, issues };
}

/** User-промпт судьи тона: контекст строки + сам тон (чистая — тестируется). */
export function toneJudgeUser(e: CatalogEntry, ton: string, prev?: string | null, next?: string | null): string {
  const who = e.who_name ?? "Narrator";
  const lines = [`Speaker: ${who} | arc: ${e.arc}${e.scene ? ` | scene: ${e.scene}` : ""}`];
  if (prev) lines.push(`Previous line: ${prev.slice(0, 200)}`);
  lines.push(`SOURCE (EN): ${e.old}`);
  if (e.new) lines.push(`RU translation: ${e.new}`);
  if (next) lines.push(`Next line: ${next.slice(0, 200)}`);
  lines.push(`TON: ${ton}`);
  return lines.join("\n");
}

async function ask(baseUrl: string, model: string, system: string, user: string): Promise<string> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
      max_tokens: 600,
      reasoning_effort: "none",
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return d.choices?.[0]?.message?.content ?? "";
}

interface Opts {
  n: number;
  threshold: number;
  pot: boolean;
  uids: string[];
}

export async function run(opts: Opts): Promise<number> {
  const voiced = voicedEntries();
  const baseUrl = process.env.LLM_URL ?? "http://127.0.0.1:1234";
  const model = process.env.LLM_MODEL ?? "qwen/qwen3.5-9b";

  // источник тона: черновик (по умолчанию, если есть) или POT
  let draft: Record<string, string> = {};
  if (!opts.pot) {
    try {
      draft = JSON.parse(readFileSync(EMOTIONS_JSON, "utf-8")) as Record<string, string>;
    } catch {
      console.log(`черновика ${EMOTIONS_JSON} нет — проверяю тон из POT (--pot)`);
    }
  }
  const tonOf = (e: CatalogEntry): string => (opts.pot ? (e.emotion ?? "") : (draft[e.uid] ?? ""));
  const idx = new Map(voiced.map((e, i) => [e.uid, i]));

  let sample: CatalogEntry[];
  if (opts.uids.length) {
    sample = opts.uids.map((u) => voiced[idx.get(u) ?? -1]).filter(Boolean);
  } else {
    const pool = voiced.filter((e) => tonOf(e).trim());
    const k = Math.max(1, Math.floor(pool.length / opts.n));
    sample = pool.filter((_, i) => i % k === 0).slice(0, opts.n);
  }
  if (!sample.length) {
    console.log("выборка пуста (тонов пока нет)");
    return 1;
  }

  console.log(
    `[emotion:judge] строк ${sample.length} | источник: ${opts.pot ? "POT" : "черновик"} | порог ${opts.threshold}`,
  );
  let ok = 0;
  let worst = 10;
  const bad: Array<{ id: string; score: number; ton: string; issues: string[] }> = [];
  for (const e of sample) {
    const i = idx.get(e.uid) ?? 0;
    const ton = tonOf(e);
    const raw = await ask(baseUrl, model, JUDGE_SYSTEM, toneJudgeUser(e, ton, voiced[i - 1]?.old, voiced[i + 1]?.old));
    const v = parseToneVerdict(raw);
    const good = v.score >= opts.threshold;
    if (good) ok++;
    else {
      worst = Math.min(worst, v.score);
      bad.push({ id: e.uid, score: v.score, ton, issues: v.issues });
    }
    console.log(`  ${good ? "OK" : "НИЗКО"} ${String(v.score).padStart(2)}/10 | ${ton.slice(0, 46)}`);
    if (!good && v.issues.length) console.log(`        - ${v.issues.join(" | ").slice(0, 140)}`);
  }
  console.log(`\n[emotion:judge] принято ${ok}/${sample.length}${bad.length ? ` | худший балл ${worst}` : ""}`);
  if (bad.length) console.log("(для точечной проверки: --uid <uid> ...)");
  return bad.length ? 1 : 0;
}

function parseCli(argv: string[]): Opts {
  const val = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const at = argv.indexOf("--uid");
  return {
    n: Number(val("--n") ?? 20),
    threshold: Number(val("--threshold") ?? 8),
    pot: argv.includes("--pot"),
    // без --uid НЕ берём argv целиком (indexOf = -1 -> slice(0) захватит всё)
    uids: at >= 0 ? argv.slice(at + 1).filter((a) => !a.startsWith("--")) : [],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(parseCli(process.argv.slice(2)))
    .then((code) => process.exit(code))
    .catch((e: unknown) => {
      console.error(e);
      process.exit(2);
    });
}
