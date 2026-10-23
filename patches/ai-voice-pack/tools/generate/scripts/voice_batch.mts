/**
 * voice_batch.mts — оркестратор батч-генерации озвучки (ПОРТ voice_batch.py).
 *
 * Разделение (tasks/2026-10-21-voice-pipeline-ts-migration.md):
 *   ЭТОТ ФАЙЛ (TS) — каталог, фильтры, эмоции, пропуски/лечения, логи, ETA,
 *     выбор рефов, ffmpeg-лечения;
 *   cosyworker.py (python) — ТОЛЬКО инференс: модель один раз на процесс,
 *     протокол v2 отдаёт сырой PCM (base64); trim + opus — voicekit/
 *     {trim,audio}.mts через voicekit/worker.mts (JSON-lines).
 *
 * Отличия от python-версии (осознанные):
 *   - резолв спикера: типизированный casts.mts (SPEAKERS -> VOICES -> реф)
 *     вместо who_codes из каст-yaml (yaml удалён 2026-10-21, python-каталог
 *     сломан: load_voices() -> 0 голосов; TS-путь покрывает 22 328/22 328
 *     dialogue-записей — проверено tmp/check_speakers.mts);
 *   - write_manifest в python — мёртвый код (не вызывается с some рефактора),
 *     здесь манифесты тоже не пишутся (паритет поведения);
 *   - heal (wav есть, opus нет) — свой ffmpeg в TS, шим не нужен.
 *
 * Запуск:
 *   node voice_batch.mts [--arc A] [--scene S] [--char C] [--uid u1 u2]
 *       [--limit N] [--force] [--lang ru|en] [--seed N] [--dry-run]
 *       [--ref path] [--emotion E] [--emotion-tag T] [--emotion-ru R]
 *       [--no-emotion] [--text T] [--device cuda|cpu] [--python PATH]
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { SPEAKERS, VOICES } from "../../../casts/casts.mts";
import { parsePo } from "../../../../../.opencode/skills/renpy-po/po_core.mts";
import { BATCH } from "./voice_presets.mts";
import { VoiceWorker } from "./voicekit/worker.mts";

// ----------------------------------------------------------------- пути ----
const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
/** patches/ai-voice-pack/tools/generate (зеркало python paths.ROOT). */
const ROOT = join(SCRIPTS_DIR, "..");
/** patches/ai-voice-pack */
export const PKG_ROOT = join(ROOT, "..", "..");
/** Источник каталога фраз — POT (единая мапа озвучки) + ru.po (переводы). */
const POT_FILE = join(PKG_ROOT, "po", "template.pot");
const RU_PO_FILE = join(PKG_ROOT, "po", "ru.po");
const CASTS_DIR = join(PKG_ROOT, "casts", "voices");
const AUDIO_DIR = join(PKG_ROOT, "audio");
const OUTPUT_DIR = join(ROOT, "output");
const BATCH_LOG = join(OUTPUT_DIR, "voice", "batch.log");
const SHIM = join(SCRIPTS_DIR, "cosyworker.py");
export const DEFAULT_PYTHON = "C:/tools/cosyvoice3/.venv/Scripts/python.exe";

const aiVoiceDir = (lang: string) => join(AUDIO_DIR, `vo_${lang}`);

// ------------------------------------------------------------- каталог ----

export interface CatalogEntry {
  uid: string;
  old: string;
  new: string;
  who?: string | null;
  who_name?: string | null;
  arc: string;
  scene?: string | null;
  category: string;
  /** Тон диктора: `#. emotion:` шаблона (emotions.json удалён — тон живёт в POT). */
  emotion?: string | null;
}

/**
 * Каталог фраз из po/template.pot (+ переводы из po/ru.po по ключу
 * msgctxt+msgid). uid = md5(msgid) — та же формула, что у potgen.
 * Категория: speaker:Narrator -> narration, speaker:* -> dialogue,
 * menu/ui/speaker-name -> не-речь (в selectPhrases отфильтровываются).
 */
export function loadCatalog(): CatalogEntry[] {
  const ruByKey = new Map<string, string>();
  for (const e of parsePo(readFileSync(RU_PO_FILE, "utf8"))) {
    if (e.msgid) ruByKey.set(`${e.msgctxt}\u0000${e.msgid}`, e.msgstr);
  }
  const comment = (comments: string[], prefix: string): string | null => {
    const c = comments.find((x) => x.startsWith(prefix));
    return c ? c.slice(prefix.length).trim() : null;
  };

  const out: CatalogEntry[] = [];
  for (const e of parsePo(readFileSync(POT_FILE, "utf8"))) {
    if (!e.msgid) continue; // заголовок
    let category: string;
    let whoName: string | null = null;
    if (e.msgctxt.startsWith("speaker:")) {
      const name = e.msgctxt.slice("speaker:".length);
      if (name === "Narrator") category = "narration";
      else {
        category = "dialogue";
        whoName = name;
      }
    } else if (e.msgctxt === "menu") category = "menu";
    else category = "ui"; // ui + speaker-name (имена) — не речь
    out.push({
      uid: createHash("md5").update(e.msgid, "utf8").digest("hex"),
      old: e.msgid,
      new: ruByKey.get(`${e.msgctxt}\u0000${e.msgid}`) ?? "",
      who: null,
      who_name: whoName,
      arc: comment(e.comments, "arc:") ?? "_unknown",
      scene: comment(e.comments, "scene:"),
      category,
      emotion: comment(e.comments, "emotion:"),
    });
  }
  return out;
}

// ------------------------------------------------------------ рефы/спикеры -

/** Активный реф голоса: VOICES[голос] -> путь рефа (null = не озвучен). */
export function refActive(voice: string): string | null {
  const rel = (VOICES as Record<string, string | null>)[voice];
  if (!rel) return null;
  const abs = join(CASTS_DIR, voice, `${voice}.wav`);
  return existsSync(abs) ? abs : null;
}

/** Разрешение рефа --ref (абсолют или casts/... от PKG_ROOT; легаси-префиксы). */
export function resolveRef(ref: string): string {
  let r = ref.replace(/\\/g, "/");
  if (r.startsWith("voice_candidates/") || r.startsWith("registry/casts/")) {
    r = "casts/voices/" + r.replace(/^voice_candidates\/|^registry\/casts\//, "");
  }
  if (r.startsWith("casts/") && !r.startsWith("casts/voices/")) {
    r = "casts/voices/" + r.slice("casts/".length);
  }
  if (isAbsolute(r)) return r;
  if (r.startsWith("casts/")) return join(PKG_ROOT, r);
  return join(ROOT, r);
}

// --------------------------------------------------------------- выбор ----

export interface Phrase {
  uid: string;
  arc: string;
  category: string;
  voice: string;
  ref: string;
  out: string;
  variant: string;
  lang: string;
  text: string;
  textOld: string;
  textNew: string;
  emotion: string | null;
  emotionRu: string | null;
}

export interface Args {
  arc?: string;
  scene?: string;
  char?: string;
  uid?: string[];
  limit?: number;
  force: boolean;
  lang: string;
  seed: number;
  dryRun: boolean;
  ref?: string;
  emotion?: string;
  emotionTag: string;
  emotionRu?: string;
  noEmotion: boolean;
  text?: string;
  device: string;
  python: string;
}

/** Голос спикера: SPEAKERS[who_name] (dialogue) / SPEAKERS.Narrator (narration). */
export function voiceForSpeaker(e: CatalogEntry): string | null {
  const name = e.category === "narration" ? "Narrator" : e.who_name || "Narrator";
  return (SPEAKERS as Record<string, string | null>)[name] ?? null;
}

function basenameNoExt(p: string): string {
  const b = p.split(/[\\/]/).pop() || p;
  return b.replace(/\.[^.]+$/, "");
}

/** Фильтр каталога до фраз к генерации (порция select_phrases python). */
export function selectPhrases(entries: CatalogEntry[], args: Args): Phrase[] {
  const phrases: Phrase[] = [];

  if (args.text) {
    // демо-режим: произвольный текст, uid = md5(text), arc = --arc | Demo
    const uid = createHash("md5").update(args.text, "utf8").digest("hex");
    const arc = args.arc || "Demo";
    const char = args.char || "";
    let ref: string | null;
    let variant: string;
    if (args.ref) {
      ref = resolveRef(args.ref);
      variant = basenameNoExt(args.ref);
    } else {
      ref = refActive(char);
      variant = char;
    }
    if (!ref) return [];
    if (args.emotion) variant += `_${args.emotionTag}`;
    const out = join(aiVoiceDir(args.lang), arc, `${uid}__${variant}.wav`);
    phrases.push({
      uid,
      arc,
      category: "demo",
      voice: args.char || "Demo",
      ref,
      out,
      variant,
      lang: args.lang,
      text: args.text,
      textOld: args.text,
      textNew: args.text,
      emotion: args.noEmotion ? null : args.emotion || null,
      emotionRu: args.emotionRu || null,
    });
    return phrases;
  }

  for (const e of entries) {
    if (e.category !== "dialogue" && e.category !== "narration") continue;
    const voice = voiceForSpeaker(e);
    if (!voice) continue;
    if (args.arc && e.arc !== args.arc) continue;
    if (args.scene && (e.scene ?? null) !== args.scene) continue;
    if (args.char && (e.who_name || "Narrator") !== args.char) continue;
    if (args.uid && !args.uid.includes(e.uid)) continue;
    let ref: string | null;
    let variant: string;
    if (args.ref) {
      ref = resolveRef(args.ref);
      variant = basenameNoExt(args.ref);
    } else {
      ref = refActive(voice);
      variant = voice;
    }
    if (!ref) continue; // не озвучен (нет активного рефа) — как в python
    if (args.emotion) variant += `_${args.emotionTag}`;
    else if (args.noEmotion) variant += "_plain";
    const emo = args.noEmotion ? null : args.emotion || e.emotion || null;
    const text = args.lang === "ru" ? e.new : e.old;
    if (!text) continue; // непереведённая реплика — синтезировать нечего
    const out = join(aiVoiceDir(args.lang), e.arc, `${e.uid}__${variant}.wav`);
    phrases.push({
      uid: e.uid,
      arc: e.arc,
      category: e.category,
      voice,
      ref,
      out,
      variant,
      lang: args.lang,
      text,
      textOld: e.old,
      textNew: e.new,
      emotion: emo,
      emotionRu: args.emotionRu || null,
    });
  }
  return phrases;
}

// -------------------------------------------------------- heal (ffmpeg) ----

/** wav есть, opus нет -> доконвертить opus (как python wav_to_opus). */
export function healWavToOpus(wavPath: string): boolean {
  const opus = wavPath.replace(/\.[^.]+$/, ".opus");
  const part = opus + ".part";
  try {
    const r = spawnSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-i", wavPath, "-c:a", "libopus", "-b:a", "24k", "-ac", "1", "-f", "opus", part],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    if (r.status === 0 && existsSync(part) && statSync(part).size > 0) {
      renameSync(part, opus);
      return true;
    }
    if (existsSync(part)) rmSync(part, { force: true });
  } catch {
    /* fail-soft: opus не докрутился — вернётся false, пойдёт регенерация */
  }
  return false;
}

/**
 * «Бегущая» длительность: речь ≈11 символов/с; флаг если длина файла больше
 * 4× ожидаемого И больше 30с (короткие крики и длинные наррации не триггерят).
 * Ловит мусорные вбросы: мохибака-текст (бага 2026-10-23) и runaway модели.
 */
export function runawayDuration(text: string, durSec: number): boolean {
  return durSec > Math.max(30, (text.length / 11) * 4);
}

// --------------------------------------------------------------- лог -----

function log(msg: string): void {
  console.log(msg);
  try {
    mkdirSync(dirname(BATCH_LOG), { recursive: true });
    const t = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    appendFileSync(BATCH_LOG, `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())} ${msg}\n`, "utf8");
  } catch {
    /* лог-бой не должен ронять прогон */
  }
}

// ---------------------------------------------------------------- CLI ----

const CLI_OPTIONS = {
  "arc": { type: "string" },
  "scene": { type: "string" },
  "char": { type: "string" },
  "uid": { type: "string", multiple: true },
  "limit": { type: "string" },
  "force": { type: "boolean", default: false },
  "lang": { type: "string", default: "ru" },
  "seed": { type: "string" },
  "dry-run": { type: "boolean", default: false },
  "ref": { type: "string" },
  "emotion": { type: "string" },
  "emotion-tag": { type: "string", default: "em" },
  "emotion-ru": { type: "string" },
  "no-emotion": { type: "boolean", default: false },
  "text": { type: "string" },
  "device": { type: "string", default: "cuda" },
  "python": { type: "string", default: DEFAULT_PYTHON },
} as const;

/** Разбор аргументов CLI -> Args (пресеты эмоций раскрываются здесь же). */
export function parseCli(argv: string[]): Args {
  const { values } = parseArgs({ args: argv, options: CLI_OPTIONS });
  const presets = BATCH.instruct_presets as Record<string, string>;
  const emotion = values.emotion && presets[values.emotion] ? presets[values.emotion] : values.emotion;
  return {
    arc: values.arc,
    scene: values.scene,
    char: values.char,
    uid: values.uid,
    limit: values.limit ? parseInt(values.limit, 10) : undefined,
    force: values.force ?? false,
    lang: values.lang ?? "ru",
    seed: values.seed ? parseInt(values.seed, 10) : BATCH.seed,
    dryRun: values["dry-run"] ?? false,
    ref: values.ref,
    emotion,
    emotionTag: values["emotion-tag"] ?? "em",
    emotionRu: values["emotion-ru"],
    noEmotion: values["no-emotion"] ?? false,
    text: values.text,
    device: values.device ?? "cuda",
    python: values.python ?? DEFAULT_PYTHON,
  };
}

// --------------------------------------------------------------- main ----

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseCli(argv);
  const entries = loadCatalog();
  const phrases = selectPhrases(entries, args);
  log(`фраз к генерации: ${phrases.length} (lang=${args.lang}, force=${args.force})`);
  for (const p of phrases.slice(0, 10)) {
    log(`  ${p.uid.slice(0, 8)} | ${p.arc} | ${p.voice} | [${(p.emotion || "-").slice(0, 40)}] ${p.text.slice(0, 60)}`);
  }
  if (phrases.length > 10) log("  ...");
  if (args.dryRun) return 0;

  const w = new VoiceWorker({
    python: args.python,
    script: SHIM,
    args: ["--device", args.device],
    onLog: (l) => log(`[shim] ${l}`),
  });

  let done = 0;
  let skipped = 0;
  let healed = 0;
  let failed = 0;
  let suspect = 0;
  const total = phrases.length;
  const tStart = Date.now();

  try {
    const ping = await w.ping();
    log(`worker: ${ping.device} (model_loaded=${ping.model_loaded})`);

    for (let idx = 0; idx < total; idx++) {
      const p = phrases[idx];
      const opusPath = p.out.replace(/\.[^.]+$/, ".opus");
      if (!args.force) {
        if (existsSync(opusPath)) {
          skipped++;
          continue;
        }
        if (existsSync(p.out) && healWavToOpus(p.out)) {
          healed++;
          continue;
        }
      }
      if (args.limit !== undefined && done >= args.limit) break;
      log(`[${idx + 1}/${total}] ${p.uid.slice(0, 8)} ${p.arc} ${p.voice}: ${p.text.slice(0, 60)}`);
      const r = await w.generate({
        text: p.text,
        ref: p.ref,
        emotion: p.emotion,
        seed: args.seed,
        out: p.out,
      });
      if (r.ok) {
        done++;
        if (typeof r.dur === "number" && runawayDuration(p.text, r.dur)) {
          suspect++;
          log(`  !! RUNAWAY: ${r.dur}s на ${p.text.length} символов — подозрительно длинно, проверь файл`);
        }
        const elapsed = (Date.now() - tStart) / 1000;
        const eta = (elapsed / Math.max(done, 1)) * (total - idx - 1);
        log(`  saved ${r.saved} (${r.dur}s), eta ~${Math.round(eta / 60)} мин`);
      } else {
        failed++;
        log(`  !! FAIL ${p.uid}: ${r.error}`);
      }
    }
  } finally {
    await w.quit().catch(() => w.kill());
  }

  log(`done=${done} skipped=${skipped} healed=${healed} failed=${failed} suspect=${suspect} total=${total}`);
  return failed > 0 && done === 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
