/**
 * emotion_tag.mts — пофразовая разметка эмоций: uid -> emotion_en
 * (TON-DRAFT для potgen).
 *
 * Порт python emotion_tag.py (2026-10-22: python-оркестраторы выпищены).
 * Источник тона — сам шаблон (roundtrip `#. emotion:` в po/template.pot);
 * этот скрипт пишет ЧЕРНОВИК в tmp/emotions_tagged.json, в шаблон тон
 * попадает overlay'ем:
 *   node emotion_tag.mts [--llm-url ...] && npm run potgen -- --emotions tmp/emotions_tagged.json
 *
 * РЕЖИМЫ:
 *   эвристика (по умолчанию)  быстрые regex-правила RU+EN — «заряженные»
 *                            фразы; нейтральные остаются без тона (модель
 *                            берёт тон из текста)
 *   --llm-url URL            разметка локальной LLM через OpenAI-compatible
 *                            /v1/chat/completions (работает и с LM Studio
 *                            127.0.0.1:1234, и с ollama 11434); каждая фраза
 *                            получает тон (DEFAULT_EMO для нейтральных)
 *   --tagged                 LLM: пере-размечать только уже помеченные
 *   --dry-run                только статистика, без записи
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadCatalog, type CatalogEntry } from "./voice_batch.mts";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
/** patches/ai-voice-pack */
const PKG_ROOT = join(SCRIPTS_DIR, "..", "..", "..");
/** корень репы (для tmp/). */
export const REPO_ROOT = join(PKG_ROOT, "..", "..");
/** Черновик тона: catalog/emotions.json удалён (легаси 2026-10-22). */
export const EMOTIONS_JSON = join(REPO_ROOT, "tmp", "emotions_tagged.json");

// (regex по RU+EN тексту, emotion_en) — перенос правил из emotion_tag.py.
export const RULES: Array<[RegExp, string]> = [
  [
    /(fuck|shit|bitch|whore|cunt|bastard|slut|scum|ид[ио]? на хуй|шлюх|убью|убить|сдохн|презр|мерз)/i,
    "Angrily, with contempt",
  ],
  [/(!!!|!{2,}|крич|орать|замолч|хватит|прекрати|не смей|пошёл вон)/i, "Loudly, with intensity"],
  [/(\?{1,}|а что|почему|зачем|кто|что ты|разве)/i, "Questioningly, with curiosity"],
  [
    /(поцел|кровать|разден|тело|грудь|член|киск|любл|нежн|страст|стонать|конча|хочу тебя|прижмись)/i,
    "In a soft intimate whisper, with desire",
  ],
  [/(больн|боюсь|страшно|не надо|пожалуйста.*не|умоля|помогите|отпусти|пощад)/i, "Fearfully, with trembling pleading"],
  [/(рад|счаст|ура|отлично|прекрасно|великолепно|люблю тебя|спасибо.*богам)/i, "Happily, with warmth"],
  [/(конечно же|ну да|как же|ещё бы|конечно.*конечно|прелесть какая)/i, "Sarcastically, with a dry smirk"],
  [/(шёпот|тихо|не крич|потише|шепну|на ухо)/i, "In a hushed whisper"],
  [/(приказ|немедленно|сейчас же|встань|на колени|слушай меня|я велю)/i, "With commanding authority"],
  [/(прости|извини|виноват|прошу прощения|к сожалению)/i, "Apologetically, with regret"],
  [/(смею|ха-ха|хе-хе|ухмыл|насмеш)/i, "With a mocking chuckle"],
];

export const DEFAULT_EMO = "Evenly, with a measured neutral tone";

export const LLM_PROMPT =
  "You are a voice director. For this Russian voice line, describe the " +
  "DIRECTOR's emotional state while reading it (how the narrator or " +
  "speaker delivers it): an emotion/attitude instruction in English, " +
  '2-6 words, like "In a low menacing whisper", "Curiously observing", ' +
  '"With bored indifference", "Warmly, with affection". ' +
  "EVERY line has a delivery state - even neutral observations have the " +
  "narrator's attitude (attentively, warily, amused, flat, admiring...). " +
  "NEVER reply 'none'. Reply with ONLY the short English instruction. " +
  "Line: ";

/** Эмоция по тексту (первая подходящая) или null. */
export function tagPhrase(ru: string | null | undefined, en: string | null | undefined): string | null {
  const hay = `${ru ?? ""} ${en ?? ""}`;
  for (const [rx, emo] of RULES) {
    if (rx.test(hay)) return emo;
  }
  return null;
}

export interface LlmOpts {
  tries?: number;
  /** пауза между попытками, мс (по умолчанию 5000*(attempt+1) — как python). */
  delayMs?: number;
  fetchImpl?: typeof fetch;
}

/** Тон фразы через локальную LLM (OpenAI-compatible /v1/chat/completions). */
export async function llmAsk(baseUrl: string, model: string, line: string, opts: LlmOpts = {}): Promise<string | null> {
  const tries = opts.tries ?? 3;
  const delayMs = opts.delayMs;
  const doFetch = opts.fetchImpl ?? fetch;
  const body = JSON.stringify({
    model,
    messages: [{ role: "user", content: LLM_PROMPT + line }],
    temperature: 0.3,
    max_tokens: 25,
    stream: false,
  });
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const r = await doFetch(`${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const resp = (d.choices?.[0]?.message?.content ?? "")
        .trim()
        .replace(/^\.+|\.+$/g, "")
        .trim();
      if (resp && resp.toLowerCase() !== "none") return resp;
      return null;
    } catch {
      if (attempt < tries - 1) {
        await new Promise((s) => setTimeout(s, delayMs ?? 5000 * (attempt + 1)));
      }
    }
  }
  return null;
}

/** Озвучиваемые фразы (dialogue+narration) из POT-каталога. */
export function voicedEntries(entries: CatalogEntry[] = loadCatalog()): CatalogEntry[] {
  return entries.filter((e) => e.category === "dialogue" || e.category === "narration");
}

export interface TagStats {
  out: Record<string, string>;
  tagged: number;
  stats: Record<string, number>;
}

/** Эвристическая разметка поверх уже накопленного черновика. */
export function tagHeuristic(voiced: CatalogEntry[], existing: Record<string, string> = {}): TagStats {
  const out = { ...existing };
  const stats: Record<string, number> = {};
  let tagged = 0;
  for (const e of voiced) {
    const emo = tagPhrase(e.new, e.old);
    if (emo) {
      out[e.uid] = emo;
      stats[emo] = (stats[emo] ?? 0) + 1;
      tagged++;
    }
  }
  return { out, tagged, stats };
}

export function writeDraft(out: Record<string, string>, path: string = EMOTIONS_JSON): void {
  mkdirSync(dirname(path), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  writeFileSync(path, JSON.stringify(sorted, null, 1) + "\n", "utf-8");
}

export interface MainOpts {
  llmUrl?: string;
  llmModel?: string;
  taggedOnly?: boolean;
  dryRun?: boolean;
}

export async function run(opts: MainOpts): Promise<number> {
  const voiced = voicedEntries();
  let out: Record<string, string> = {};
  if (existsSync(EMOTIONS_JSON)) {
    out = JSON.parse(readFileSync(EMOTIONS_JSON, "utf-8")) as Record<string, string>;
  }

  if (opts.llmUrl) {
    const model = opts.llmModel ?? "phi4-mini";
    let tagged = 0;
    const t0 = Date.now();
    for (let i = 1; i <= voiced.length; i++) {
      const e = voiced[i - 1];
      if (opts.taggedOnly && !(e.uid in out)) continue;
      delete out[e.uid]; // LLM заменяет старое значение
      const emo = (await llmAsk(opts.llmUrl, model, e.new || "")) ?? DEFAULT_EMO;
      out[e.uid] = emo;
      tagged++;
      if (i % 200 === 0) {
        const rate = i / Math.max((Date.now() - t0) / 1000, 0.001);
        console.log(`  ... ${i}/${voiced.length} (${Math.round(rate * 60)} /мин), размечено ${tagged}`);
        if (!opts.dryRun) writeDraft(out);
      }
    }
    console.log(`LLM-разметка завершена: новых ${tagged}`);
  } else {
    const r = tagHeuristic(voiced, out);
    out = r.out;
    console.log(`фраз озвучиваемых: ${voiced.length}`);
    console.log(`размечено эмоций: ${r.tagged} (${Math.round((100 * r.tagged) / Math.max(voiced.length, 1))}%)`);
    for (const [emo, n] of Object.entries(r.stats).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${emo.padEnd(30)} ${n}`);
    }
  }

  if (opts.dryRun) return 0;
  writeDraft(out);
  console.log(`-> ${EMOTIONS_JSON}`);
  return 0;
}

function parseCli(argv: string[]): MainOpts {
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    llmUrl: flag("--llm-url"),
    llmModel: flag("--llm-model"),
    taggedOnly: argv.includes("--tagged"),
    dryRun: argv.includes("--dry-run"),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = parseCli(process.argv.slice(2));
  run(opts).then(
    (code) => process.exit(code),
    (e) => {
      console.error(`EMOTION_TAG ERROR: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    },
  );
}
