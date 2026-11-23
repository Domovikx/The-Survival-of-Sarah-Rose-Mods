/**
 * voice_batch.mts — оркестратор батч-генерации озвучки (ПОРТ voice_batch.py).
 *
 * Разделение (tasks/2026-10-21-voice-pipeline-ts-migration.md):
 *   ЭТОТ ФАЙЛ (TS) — каталог, фильтры, эмоции, пропуски/лечения, логи, ETA,
 *     выбор рефов, ffmpeg-лечения;
 *   voxcpmworker.py (python) — ТОЛЬКО инференс: модель один раз на процесс,
 *     протокол v2 отдаёт сырой PCM (base64); opus — voicekit/audio.mts
 *     через voicekit/worker.mts (JSON-lines).
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
 *   node voice_batch.mts [--arc A] [--scene S] [--char C] [--uid u1 --uid u2]
 *       [--uid-file f]   uid'ы из файла (по одному на строку) — например,
 *                        `po_changed --uids` для переозвучки по якорям
 *       [--limit N] [--force] [--lang ru|en|<po-код>] [--seed N] [--dry-run]
 *       [--demo]                        только демо-скоуп поставки (патч1)
 *       [--ref path] [--emotion E] [--emotion-tag T] [--emotion-ru R]
 *       [--no-emotion] [--text T] [--device cuda|cpu] [--python PATH]
 *       [--engine voxcpm2]              движок (единственный — VoxCPM2;
 *                                       флаг оставлен ради совместимости)
 *       [--keep-wav]                оставить исходный wav рядом с opus
 *       [--wav-only]                только wav, opus корпуса не перезаписывать
 *                                   (диагностика конверта wav→opus)
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { SPEAKERS, VOICES } from "../../../casts/casts.mts";
import { parsePo } from "../../../../../.opencode/skills/renpy-po/po_core.mts";
import { DEMO_SCENES } from "../../../../../.opencode/skills/renpy-po/po2tl.mts";
import { BATCH } from "./voice_presets.mts";
import { voiceBase } from "./voice_names.mts";
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

/**
 * Движок инференса: свой шим (python, протокол v2) + venv. Единственный —
 * VoxCPM2 (CosyVoice3-ветка удалена 2026-11-21).
 *
 * Имя файла = контракту {en12}-{state6} {Спикер}.opus (владелец 2026-11-11:
 * «убираем лишний постфикс» — инфикс движка выпилен).
 */
export const ENGINES = {
  voxcpm2: {
    shim: join(SCRIPTS_DIR, "voxcpmworker.py"),
    python: "C:/tools/voxcpm2/.venv/Scripts/python.exe",
  },
} as const;
export type EngineName = keyof typeof ENGINES;

const aiVoiceDir = (lang: string) => join(AUDIO_DIR, lang);

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
  /**
   * Миграционный слой `#. emotion_new:` (2026-10-26), если есть — отдельно
   * от действующего `emotion` для мониторинга перехода. В `emotion` уже
   * лежит ПРИОРИТЕТНЫЙ тон (emotion_new ?? emotion).
   */
  emotionNew?: string | null;
}

/**
 * Каталог фраз из po/template.pot (+ переводы из po/<lang>.po по ключу
 * msgctxt+msgid; lang — параметр функции, по умолчанию ru, en — без po →
 * new пуст → строка отфильтруется). uid = md5(msgid) — та же формула, что у potgen.
 * Категория: speaker:Narrator -> narration, speaker:* -> dialogue,
 * menu/ui/speaker-name -> не-речь (в selectPhrases отфильтровываются).
 */
/**
 * POT не зависит от языка, а раньше разбирался заново на КАЖДЫЙ вызов
 * `loadCatalog(lang)` — 68 357 записей × 11 языков. Замер 2026-11-22:
 * `voice_status --fast` 14 s, из них 41% внутри `loadCatalog`. Теперь POT
 * разбирается один раз, per-lang — кэш по mtime `po/<lang>.po`.
 * Правка POT «на живом процессе» не подхватывается: процессы короткие.
 */
type PotRow = {
  key: string;
  uid: string;
  msgid: string;
  arc: string;
  scene: string | null;
  category: string;
  whoName: string | null;
  emotion: string | null;
  emotionNew: string | null;
};

let potRowsCache: PotRow[] | null = null;

const comment = (comments: string[], prefix: string): string | null => {
  const c = comments.find((x) => x.startsWith(prefix));
  return c ? c.slice(prefix.length).trim() : null;
};

const mtimeOf = (file: string): number => {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};

function buildPotRows(): PotRow[] {
  const rows: PotRow[] = [];
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
    rows.push({
      key: `${e.msgctxt}\u0000${e.msgid}`,
      uid: createHash("md5").update(e.msgid, "utf8").digest("hex"),
      msgid: e.msgid,
      arc: comment(e.comments, "arc:") ?? "_unknown",
      scene: comment(e.comments, "scene:"),
      category,
      whoName,
      // МИГРАЦИЯ 2026-10-26: действующий тон = `emotion_new` ?? `emotion`
      // (новый тон overlay'ем potgen пишется РЯДОМ со старым — плавный
      // переход: у уже сгенерированного звука остаётся его тональность).
      emotion: comment(e.comments, "emotion_new:") ?? comment(e.comments, "emotion:"),
      emotionNew: comment(e.comments, "emotion_new:"),
    });
  }
  return rows;
}

const potRows = (): PotRow[] => (potRowsCache ??= buildPotRows());

/** msgstr языка: ключ `msgctxt\0msgid` -> текст, кэш по mtime файла. */
const poCache = new Map<string, { mtime: number; byKey: Map<string, string> }>();
function poByKey(poFile: string): Map<string, string> {
  const mtime = mtimeOf(poFile);
  const hit = poCache.get(poFile);
  if (hit && hit.mtime === mtime) return hit.byKey;
  const byKey = new Map<string, string>();
  if (existsSync(poFile)) {
    for (const e of parsePo(readFileSync(poFile, "utf8"))) {
      if (e.msgid) byKey.set(`${e.msgctxt}\u0000${e.msgid}`, e.msgstr);
    }
  }
  poCache.set(poFile, { mtime, byKey });
  return byKey;
}

/**
 * Каталог фраз из po/template.pot (+ переводы из po/<lang>.po по ключу
 * msgctxt+msgid; lang — параметр функции, по умолчанию ru, en — без po →
 * new пуст → строка отфильтруется). uid = md5(msgid) — та же формула, что у potgen.
 * Категория: speaker:Narrator -> narration, speaker:* -> dialogue,
 * menu/ui/speaker-name -> не-речь (в selectPhrases отфильтровываются).
 *
 * Возвращается КЭШИРОВАННЫЙ массив: читать/фильтровать можно, мутировать нет.
 */
const catalogCache = new Map<string, { mtime: number; entries: CatalogEntry[] }>();

export function loadCatalog(lang = "ru"): CatalogEntry[] {
  const poFile = lang === "ru" ? RU_PO_FILE : join(PKG_ROOT, "po", `${lang}.po`);
  const mtime = mtimeOf(poFile);
  const hit = catalogCache.get(lang);
  if (hit && hit.mtime === mtime) return hit.entries;

  const byKey = poByKey(poFile);
  const entries = potRows().map((r) => ({
    uid: r.uid,
    old: r.msgid,
    new: byKey.get(r.key) ?? "",
    who: null,
    who_name: r.whoName,
    arc: r.arc,
    scene: r.scene,
    category: r.category,
    emotion: r.emotion,
    emotionNew: r.emotionNew,
  }));
  catalogCache.set(lang, { mtime, entries });
  return entries;
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
  /** Только демо-скоуп поставки (см. isDemoEntry): патч1 = демо-озвучка. */
  demo: boolean;
  ref?: string;
  emotion?: string;
  emotionTag: string;
  emotionRu?: string;
  noEmotion: boolean;
  text?: string;
  device: string;
  /** Параллельные воркеры (каждый — свой процесс с моделью). */
  workers: number;
  python: string;
  /** Движок инференса (см. ENGINES); единственный — voxcpm2. */
  engine?: EngineName;
  /**
   * Оставить исходный wav рядом с opus (диагностика wav→opus-конверта):
   * PCM → writeWav16 → loudnorm → opus рядом, wav НЕ удаляется
   * (voicekit/worker.mts encode, ветка req.keep_wav).
   */
  keepWav: boolean;
  /**
   * Только wav, без opus (voicekit/worker.mts encode, ветка req.wav_only):
   * корпусной `{en12}-{state6} {variant}.opus` НЕ перезаписывается — режим сравнительных
   * съёмок вариантов движка (у keep_wav opus как раз пишется, инцидент 2026-10-27).
   */
  wavOnly: boolean;
}

/** Голос спикера: SPEAKERS[who_name] (dialogue) / SPEAKERS.Narrator (narration). */
export function voiceForSpeaker(e: CatalogEntry): string | null {
  const name = e.category === "narration" ? "Narrator" : e.who_name || "Narrator";
  return (SPEAKERS as Record<string, string | null>)[name] ?? null;
}

/** Демо-скоуп поставки (2026-11-09) для ОЗВУЧИВАЕМЫХ записей: msgctxt у них
 *  speaker:*, поэтому isDemoScope (po2tl) сводится к арке/сцене. ЕДИНСТВЕННЫЙ
 *  предикат демо для генерации и судьи (DRY). */
export function isDemoEntry(e: Pick<CatalogEntry, "arc" | "scene">): boolean {
  return e.arc === "Prologue" || DEMO_SCENES.has(e.scene ?? "");
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
    // Имя = {en16}__{state8}__{вариант}.opus: тон входит в state8.
    const demoEmo = args.noEmotion ? null : (args.emotion ?? null);
    const demoBase = voiceBase({ en: args.text, variant, spoken: args.text, emotion: demoEmo });
    const out = join(aiVoiceDir(args.lang), arc, `${demoBase}.wav`);
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
    if (args.demo && !isDemoEntry(e)) continue;
    const voice = voiceForSpeaker(e);
    if (!voice) continue;
    if (args.arc && e.arc !== args.arc) continue;
    if (args.scene && (e.scene ?? null) !== args.scene) continue;
    if (args.char && (e.who_name || "Narrator") !== args.char) continue;
    // ВАЖНО: пустой массив uid = «без фильтра». Проверка `if (args.uid && …)`
    // отбрасывала ВСЕ фразы, потому что [] truthy (поймано 2026-11-16).
    if ((args.uid?.length ?? 0) > 0 && !args.uid!.includes(e.uid)) continue;
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
    // Суффиксы _passion/_plain не нужны: тон входит в state8.
    const emo = args.noEmotion ? null : args.emotion || e.emotion || null;
    // Текст языка: перевод po/<lang>.po (каталог читается под этот lang),
    // en — оригинал (po/en.po нет в десятке языков).
    const text = args.lang === "en" ? e.old : e.new;
    if (!text) continue; // непереведённая реплика — синтезировать нечего
    const base = voiceBase({ en: e.old, variant, spoken: text, emotion: emo });
    const out = join(aiVoiceDir(args.lang), e.arc, `${base}.wav`);
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
  "uid-file": { type: "string" },
  "limit": { type: "string" },
  "force": { type: "boolean", default: false },
  "lang": { type: "string", default: "ru" },
  "seed": { type: "string" },
  "dry-run": { type: "boolean", default: false },
  "demo": { type: "boolean", default: false },
  "ref": { type: "string" },
  "emotion": { type: "string" },
  "emotion-tag": { type: "string", default: "em" },
  "emotion-ru": { type: "string" },
  "no-emotion": { type: "boolean", default: false },
  "text": { type: "string" },
  "device": { type: "string", default: "cuda" },
  // Параллельные воркеры (каждый = свой процесс с моделью). 2 воркера дают
  // ~1.76x на 16 ГБ VRAM (замер 2026-11-21), но требуют ~15.3 ГБ.
  "workers": { type: "string", default: "1" },
  // без default: значение считается в parseCli по выбранному движку
  "python": { type: "string" },
  "engine": { type: "string", default: "voxcpm2" },
  "keep-wav": { type: "boolean", default: false },
  "wav-only": { type: "boolean", default: false },
} as const;

/** Разбор аргументов CLI -> Args (пресеты эмоций раскрываются здесь же). */
export function parseCli(argv: string[]): Args {
  const { values } = parseArgs({ args: argv, options: CLI_OPTIONS });
  const presets = BATCH.instruct_presets as Record<string, string>;
  const emotion = values.emotion && presets[values.emotion] ? presets[values.emotion] : values.emotion;
  const engine = (values.engine ?? "voxcpm2") as EngineName;
  if (!(engine in ENGINES)) {
    throw new Error(`неизвестный движок "${engine}". Доступные: ${Object.keys(ENGINES).join(", ")}`);
  }
  return {
    arc: values.arc,
    scene: values.scene,
    char: values.char,
    uid: [
      ...(values.uid ?? []),
      ...(values["uid-file"] ? readFileSync(values["uid-file"], "utf-8").split(/\s+/u).filter(Boolean) : []),
    ],
    limit: values.limit ? parseInt(values.limit, 10) : undefined,
    force: values.force ?? false,
    lang: values.lang ?? "ru",
    seed: values.seed ? parseInt(values.seed, 10) : BATCH.seed,
    dryRun: values["dry-run"] ?? false,
    demo: values.demo ?? false,
    ref: values.ref,
    emotion,
    emotionTag: values["emotion-tag"] ?? "em",
    emotionRu: values["emotion-ru"],
    noEmotion: values["no-emotion"] ?? false,
    text: values.text,
    device: values.device ?? "cuda",
    workers: Math.max(1, Math.min(4, parseInt(values.workers ?? "1", 10) || 1)),
    engine,
    keepWav: values["keep-wav"] ?? false,
    wavOnly: values["wav-only"] ?? false,
    // python по умолчанию — VENV ВЫБРАННОГО движка (для voxcpm2 свой)
    python: values.python ?? ENGINES[engine].python,
  };
}

// --------------------------------------------------------------- main ----

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseCli(argv);
  const engine = ENGINES[args.engine ?? "voxcpm2"];
  const entries = loadCatalog(args.lang);
  const phrases = selectPhrases(entries, args);
  log(`фраз к генерации: ${phrases.length} (lang=${args.lang}, force=${args.force})`);
  for (const p of phrases.slice(0, 10)) {
    log(`  ${p.uid.slice(0, 8)} | ${p.arc} | ${p.voice} | [${(p.emotion || "-").slice(0, 40)}] ${p.text.slice(0, 60)}`);
  }
  if (phrases.length > 10) log("  ...");
  if (args.dryRun) return 0;

  const mkWorker = (): VoiceWorker =>
    new VoiceWorker({
      python: args.python,
      script: engine.shim,
      // voxcpm2-шим не принимает --device: CUDA выбирается сама; cfg/timesteps —
      // дефолты самого шима (вердикт со стенда voxcpm_bench.mts, 2026-10-27)
      args: [],
      onLog: (l) => log(`[shim] ${l}`),
    });

  let done = 0;
  let skipped = 0;
  let healed = 0;
  let failed = 0;
  let suspect = 0;
  const total = phrases.length;
  const tStart = Date.now();

  // Пул воркеров: N процессов, каждый со своей моделью. Фразы раздаются
  // по одной (общий курсор) — порядок сохраняется, дублей нет.
  const all = Array.from({ length: args.workers }, () => mkWorker());
  let cursor = 0;
  const stop = { value: false };

  try {
    for (const worker of all) {
      const ping = await worker.ping();
      log(`worker: ${ping.device} (model_loaded=${ping.model_loaded})`);
    }
    log(`воркеров: ${all.length}`);

    const take = (): number | null => (stop.value || cursor >= total ? null : cursor++);

    const runner = async (worker: VoiceWorker): Promise<void> => {
      for (;;) {
        const idx = take();
        if (idx === null) return;
        const p = phrases[idx]!;
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
        if (args.limit !== undefined && done >= args.limit) {
          stop.value = true;
          return;
        }
        log(`[${idx + 1}/${total}] ${p.uid.slice(0, 8)} ${p.arc} ${p.voice}: ${p.text.slice(0, 60)}`);
        const r = await worker.generate({
          text: p.text,
          ref: p.ref,
          emotion: p.emotion,
          seed: args.seed,
          out: p.out,
          keep_wav: args.keepWav || undefined,
          wav_only: args.wavOnly || undefined,
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
    };

    await Promise.all(all.map((worker) => runner(worker)));
  } finally {
    await Promise.all(all.map((worker) => worker.quit().catch(() => worker.kill())));
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
