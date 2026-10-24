/**
 * po_translate.mts — система локальных高质量-переводов po/<lang>.po на
 * локальной LLM (LM Studio, OpenAI-compatible). Построчный перевод: каждая
 * запись — отдельный запрос с контекстом сцены, авточеками качества,
 * судьёй-ревьюером и ретраем по фидбэку. Резюмабелен: переведённые не
 * трогаются, файл флушится каждые N записей (сбой процесса теряет ≤N).
 *
 * Конфиг выбран экспериментом 2026-10-23 (матрица A–F на qwen/mimo,
 * см. tasks/): qwen3.5-9b + reasoning_effort=none + temp 0.3 + few-shot
 * + retry + судья. ВАЖНО: thinking в LM Studio выключается ТОЛЬКО полем
 * reasoning_effort="none" (enable_thinking=false и think:false игнорируются,
 * reasoning съедает max_tokens и content пустой — ловушка №1).
 *
 * ЗАПУСК (LM Studio поднят, модель загружена):
 *   node .opencode/skills/renpy-po/po_translate.mts --lang es --limit 50
 *
 * УПРАВЛЕНИЕ ПО ТРЕБОВАНИЮ (механизм чистого стопа под коммит-чекпоинты,
 * 2026-10-24): стоп → текущие записи дорабатываются → файл сброшен →
 * exit 0 → po-файл целостен → коммит → старт с места (resumable).
 *   npm run po:translate -- --lang es        старт/резюм; снимает висячий
 *                                            флаг стопа, пишет pid-файл
 *   npm run po:translate:stop -- --lang es   чистая остановка (флаг в
 *                                            tmp/po_translate_<lang>.stop;
 *                                            без --lang — все языки)
 *   npm run po:translate:status              все языки: идёт/стоп, пустые,
 *                                            счёт jsonl, время активности
 * Худшая задержка стопа = текущая запись (ретраи LLM тоже проверяют флаг).
 * После стопа pid-файл удаляется; убитый kill'ом прогон оставляет
 * устаревший pid — status показывает «стоп», старт его перетирает.
 *
 * Флаги:
 *   --lang CODE       язык (de,es,fr,it,ja,ko,pl,pt,ru,zh) — обязателен
 *                     (кроме --ctl stop/status без --lang = все языки)
 *   --ctl MODE        stop | status — управление, без перевода
 *   --limit N         перевести не более N записей (по умолчанию без лимита)
 *   --start-line N    начать с записи порядковым индексом N (по умолчанию 0)
 *   --concurrency N   параллельные запросы (по умолчанию 1 — строго построчно)
 *   --flush-every N   записывать файл каждые N переводов (по умолчанию 20)
 *   --threshold N     минимальный балл судьи для приёмки (по умолчанию 9)
 *   --no-judge        без LLM-судьи (только авточеки) — быстрее, но хуже
 *   --dry             только план (сколько записей, без перевода)
 *   --base-url URL    LM Studio (по умолчанию http://127.0.0.1:1234)
 *   --model NAME      модель (по умолчанию qwen/qwen3.5-9b)
 *
 * Выход: po/<lang>.po перезаписан на месте (round-trip через renderPo
 * проверен байт-в-байт для всех 10 языков), отчёт и JSONL-выборка для
 * ушной проверки — tmp/po_translate_<lang>.log / .jsonl.
 */
import { appendFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parsePo, renderPo } from "./po_core.mts";
import type { PoEntry } from "./po_core.mts";
import { poHeaderLines } from "./po_update.mts";
import { langProfile } from "./po_langs.mts";
import { loadPotIndex } from "./pot_resolve.mts";

// Последовательные await здесь ОСМЫСЛЕННЫ: перевод идёт строго построчно
// (требование владельца — максимальное качество), а воркеры — это N
// независимых последовательных потоков, а не одна общая очередь.
/* oxlint-disable no-await-in-loop */

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SKILL_DIR, "..", "..", "..");
const PO_DIR = join(REPO_ROOT, "patches", "ai-voice-pack", "po");
export const TMP_DIR = join(REPO_ROOT, "tmp");

export interface Opts {
  lang: string;
  ctl: string;
  limit: number;
  startLine: number;
  concurrency: number;
  flushEvery: number;
  threshold: number;
  judge: boolean;
  dry: boolean;
  baseUrl: string;
  model: string;
}

/** Разбор CLI. */
export function parseArgs(argv: string[]): Opts {
  const f = (name: string, def: string): string => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
  };
  return {
    lang: f("lang", ""),
    ctl: f("ctl", ""),
    limit: Number(f("limit", "0")),
    startLine: Number(f("start-line", "0")),
    concurrency: Math.max(1, Number(f("concurrency", "1"))),
    flushEvery: Math.max(1, Number(f("flush-every", "20"))),
    threshold: Number(f("threshold", "9")),
    judge: !argv.includes("--no-judge"),
    dry: argv.includes("--dry"),
    baseUrl: f("base-url", "http://127.0.0.1:1234"),
    model: f("model", "qwen/qwen3.5-9b"),
  };
}

// ---------- LLM ----------

interface ChatMsg {
  role: "system" | "user";
  content: string;
}

/** Запрос к OpenAI-compatible /v1/chat/completions с ретраями. */
export async function chat(
  baseUrl: string,
  messages: ChatMsg[],
  o: { model: string; temp: number; maxTokens: number },
  tries = 3,
): Promise<string> {
  const body = JSON.stringify({
    model: o.model,
    messages,
    temperature: o.temp,
    max_tokens: o.maxTokens,
    stream: false,
    // ЕДИНСТВЕННЫЙ рабочий способ выключить thinking у qwen3.5 в LM Studio:
    // enable_thinking=false / think:false игнорируются (баг lmstudio#1990).
    reasoning_effort: "none",
  });
  let lastErr = "";
  for (let a = 0; a < tries; a++) {
    try {
      const r = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(180_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
      const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const c = d.choices?.[0]?.message?.content ?? "";
      if (!c.trim()) throw new Error("пустой content");
      return c.trim();
    } catch (e) {
      lastErr = String(e);
      if (a < tries - 1) await new Promise((s) => setTimeout(s, 2000 * (a + 1)));
    }
  }
  throw new Error(`LLM не ответила: ${lastErr}`);
}

/** Первая {...}-последовательность в ответе (модель любит обрамления). */
export function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ---------- Промпт ----------

/** System prompt: правила языка + few-shot стиля. */
export function systemPrompt(lang: string): string {
  const p = langProfile(lang);
  const shots = p.fewshot.length
    ? `\n\nSTYLE EXAMPLES (EN -> target, same register):\n` +
      p.fewshot.map(([en, tr], i) => `${i + 1}. EN: ${en}\n   TARGET: ${tr}`).join("\n")
    : "";
  return p.rules + shots;
}

/** User prompt: контекст соседних строк + тон из POT (обратный резолв) + спикер + EN-строка. */
export function userPrompt(
  entry: { msgctxt: string; msgid: string },
  prev: string[],
  next: string[],
  feedback: string,
  emotion: string | null,
): string {
  const emo = emotion ?? "Curiously observing";
  const parts: string[] = [];
  if (prev.length) parts.push("CONTEXT (previous lines):", ...prev, "");
  parts.push(`emotion: ${emo}`);
  parts.push(`speaker: ${entry.msgctxt || '"speaker:Narrator"'}`);
  parts.push(`EN: ${JSON.stringify(entry.msgid).slice(1, -1)}`);
  if (next.length) parts.push("", "CONTEXT (following lines):", ...next);
  if (feedback) parts.push("", feedback);
  return parts.join("\n");
}

// ---------- Авточеки ----------

/** Строки msgstr уже в файле субтитры-стиля: без кавычек, если EN без них. */
export function checkTranslation(entry: PoEntry, es: string, lang: string): string[] {
  const issues: string[] = [];
  const p = langProfile(lang);
  const mid = entry.msgid;
  if (!es.trim()) issues.push("пустой перевод");
  if (es.trim() === mid.trim()) issues.push("msgstr == msgid (не переведено)");
  for (const [re, why] of p.forbidden) {
    try {
      if (new RegExp(re, "iu").test(es)) issues.push(why);
    } catch {
      /* невалидный regex профиля */
    }
  }
  // КРИТ-ФИКС 2026-10-24: проверка длины (ratio) ВЫПИЛЕНА полностью — для
  // CJK (zh/ja/ko) 1 иероглиф = слово, а для коротких UI-кнопок
  // («Save»->«Guardar» ×1.75) ratio-лимит давал ложные rejected.
  // Длина НЕ является критерием качества ни для одного языка.
  // Плейсхолдеры: printf %s/%d и Ren'Py-теги {i}...{/i} должны сохраниться
  const ph = (s: string) => (s.match(/%[sd]|\{\/?[a-zA-Z][^}]*\}/g) ?? []).sort().join("|");
  if (ph(mid) && ph(mid) !== ph(es)) issues.push(`потеряны плейсхолдеры/теги: ${ph(mid)}`);
  // Кавычки: EN без внешних кавычек → перевод без них (стиль pilot/ru.po)
  const midQuoted = /^["«]/.test(mid.trim());
  if (!midQuoted && /^["«]/.test(es.trim())) issues.push("добавлены кавычки к реплике (оригинал без них)");
  return issues;
}

// ---------- Судья ----------

const JUDGE_SYSTEM = `You are a strict localization QA reviewer for an adult visual novel (EN -> target language, one file may serve several regions). Judge the candidate translation against the English source, speaker, and emotion tag.

Score 0-10 and list issues. Check: completeness (nothing dropped/added), fidelity to the emotion tag, grammar/gender agreement of the target language, register (frank erotic prose — NO clinical terms in scenes; the target-language lexicon in the task rules is MANDATORY), address-form consistency, naturalness (no Anglicisms/translationese). NEVER penalize translation length (CJK and UI labels legitimately differ in character count).

CRITICAL: never recommend clinical substitutes (e.g. for Spanish "pene/vagina/penetrar" are FORBIDDEN, not preferred). The explicit lexicon is the correct register.

Output STRICT JSON only: {"score":<0-10 int>,"issues":["...", ...]}. Each issue SHORT (max 12 words), max 3 issues; [] if perfect. No text outside the JSON.`;

/** Балл судьи 0..10 и её замечания; -1 если судья не ответил. */
export async function judge(
  baseUrl: string,
  model: string,
  lang: string,
  entry: PoEntry,
  tr: string,
  emotion: string | null,
): Promise<{ score: number; issues: string[] }> {
  const p = langProfile(lang);
  const emo = emotion ?? "-";
  const user = `${p.judgeNotes}\n\nemotion: ${emo}\nspeaker: ${entry.msgctxt || "-"}\nEN: ${entry.msgid}\nTARGET(${lang}): ${tr}`;
  const raw = await chat(
    baseUrl,
    [
      { role: "system", content: JUDGE_SYSTEM },
      { role: "user", content: user },
    ],
    { model, temp: 0.1, maxTokens: 900 },
  ).catch((e: Error) => `__ERROR__ ${e.message}`);
  if (raw.startsWith("__ERROR__")) return { score: -1, issues: [raw.slice(0, 120)] };
  const j = extractJson(raw);
  if (j && typeof j.score === "number") {
    return { score: j.score, issues: Array.isArray(j.issues) ? (j.issues as string[]) : [] };
  }
  const m = /"score"\s*:\s*(\d+)/.exec(raw);
  return m
    ? { score: Number(m[1]), issues: ["судья вернул битый JSON — issues потеряны"] }
    : { score: -1, issues: [`судья не вернул JSON: ${raw.slice(0, 80)}`] };
}

// ---------- Перевод одной записи ----------

export interface EntryResult {
  line: number;
  msgid: string;
  tr: string;
  tries: number;
  judgeScore: number;
  rejected: boolean;
  issues: string[];
}

/** Один целевой перевод: до 3 попыток, фидбэк = авточеки/замечания судьи. */
export async function translateEntry(
  baseUrl: string,
  model: string,
  lang: string,
  entry: PoEntry,
  prev: string[],
  next: string[],
  useJudge: boolean,
  threshold: number,
  emotion: string | null,
): Promise<EntryResult> {
  const sys = systemPrompt(lang);
  let feedback = "";
  let best = { tr: "", score: -1, issues: [] as string[] };
  const maxTries = 3;
  for (let t = 0; t < maxTries; t++) {
    const raw = await chat(
      baseUrl,
      [
        { role: "system", content: sys },
        { role: "user", content: userPrompt(entry, prev, next, feedback, emotion) },
      ],
      { model, temp: 0.3, maxTokens: 700 },
    );
    const j = extractJson(raw);
    const tr = j && typeof j.es === "string" ? (j.es as string).trim() : "";
    const auto = checkTranslation(entry, tr, lang);
    if (tr && auto.length === 0) {
      if (!useJudge) {
        return { line: 0, msgid: entry.msgid, tr, tries: t + 1, judgeScore: -1, rejected: false, issues: [] };
      }
      const v = await judge(baseUrl, model, lang, entry, tr, emotion);
      if (v.score > best.score) best = { tr, score: v.score, issues: v.issues };
      if (v.score >= threshold) {
        return { line: 0, msgid: entry.msgid, tr, tries: t + 1, judgeScore: v.score, rejected: false, issues: [] };
      }
      feedback = `Your previous answer was graded ${v.score}/10. Fix: ${v.issues.slice(0, 3).join("; ") || "improve naturalness and tone"}. Output JSON only.`;
    } else {
      const wasBest = auto.length < best.issues.length || best.score < 0;
      if (tr && wasBest && best.score < 0) best = { tr, score: -1, issues: auto };
      feedback = `Your previous answer was rejected: ${auto.join("; ") || "invalid JSON"}. Fix and output JSON only.`;
    }
  }
  // Не принято: лучшая попытка остаётся за пределами файла (пустой msgstr
  // = игра покажет оригинал EN), запись уходит в отчёт на ручную правку.
  return {
    line: 0,
    msgid: entry.msgid,
    tr: "",
    tries: maxTries,
    judgeScore: best.score,
    rejected: true,
    issues: best.issues,
  };
}

// ---------- Управление: стоп/статус ----------

const STOP_FLAG = (lang: string): string => join(TMP_DIR, `po_translate_${lang}.stop`);
const PID_FILE = (lang: string): string => join(TMP_DIR, `po_translate_${lang}.pid`);

/** Флаг чистой остановки на месте? (воркер проверяет перед каждой записью) */
export function stopRequested(lang: string): boolean {
  return existsSync(STOP_FLAG(lang));
}

/** Прогон этого языка жив? (pid-файл существует и процесс отвечает) */
export function isRunning(lang: string): boolean {
  if (!existsSync(PID_FILE(lang))) return false;
  const pid = Number(readFileSync(PID_FILE(lang), "utf-8").trim());
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0); // probe без сигнала
    return true;
  } catch {
    return false; // устаревший pid (kill'ом) — старт перетрёт
  }
}

/** ctl stop: поставить флаг (или все языки, если --lang не задан). */
export function ctlStop(langs: string[]): void {
  for (const lang of langs) {
    if (!isRunning(lang)) {
      console.log(`${lang}: прогон не идёт — флаг не нужен${stopRequested(lang) ? " (висячий флаг снят)" : ""}`);
      rmSync(STOP_FLAG(lang), { force: true });
      continue;
    }
    writeFileSync(STOP_FLAG(lang), String(Date.now()), "utf-8");
    console.log(`${lang}: флаг стопа поставлен — текущие записи доработают, файл будет сброшен (жди ≈1-15с/запись)`);
  }
}

/** ctl status: по всем языкам — идёт/стоп, пустых, jsonl, активность. */
export function ctlStatus(langs: string[]): void {
  for (const lang of langs) {
    const poPath = join(PO_DIR, `${lang}.po`);
    if (!existsSync(poPath)) continue;
    const empty = parsePo(readFileSync(poPath, "utf-8").replace(/\r\n/g, "\n")).filter(
      (e) => e.msgid && !e.msgstr.trim(),
    ).length;
    const running = isRunning(lang);
    const flag = stopRequested(lang);
    const jsonlPath = join(TMP_DIR, `po_translate_${lang}.jsonl`);
    let done = 0;
    let rej = 0;
    let last = "-";
    if (existsSync(jsonlPath)) {
      const lines = readFileSync(jsonlPath, "utf-8").trimEnd().split("\n");
      for (const l of lines) {
        if (l.includes('"rejected":true') || l.includes('"error"')) rej++;
        else done++;
      }
      last = new Date(statSync(jsonlPath).mtimeMs).toISOString().slice(11, 16);
    }
    const state = running ? (flag ? "ИДЁТ (стоп запрошен)" : "ИДЁТ") : flag ? "остановлен (флаг висит)" : "стоп";
    console.log(`${lang}: ${state} | пустых ${empty} | jsonl ok=${done} rejected=${rej} | последняя запись ${last}Z`);
  }
}

// ---------- main ----------

interface Target {
  idx: number;
  entry: PoEntry;
}

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2));
  const ALL_LANGS = ["de", "es", "fr", "it", "ja", "ko", "pl", "pt", "ru", "zh"];
  if (o.ctl === "stop") {
    ctlStop(o.lang ? [o.lang] : ALL_LANGS);
    return;
  }
  if (o.ctl === "status") {
    ctlStatus(o.lang ? [o.lang] : ALL_LANGS);
    return;
  }
  if (!o.lang) {
    console.error(
      "Usage: node po_translate.mts --lang es [--limit N] [--start-line N] [--dry] [--no-judge]\n" +
        "       node po_translate.mts --ctl stop [--lang es]   чистая остановка\n" +
        "       node po_translate.mts --ctl status [lang es]    статус прогонов",
    );
    process.exit(1);
  }
  const profile = langProfile(o.lang); // валидация языка
  if (isRunning(o.lang)) {
    console.error(`${o.lang}: прогон уже идёт (см. po:translate:status). Дубль не запускаем.`);
    process.exit(1);
  }
  const pot = loadPotIndex(); // DRY: тон/arc/scene — из POT обратным пайплайном
  const poPath = join(PO_DIR, `${o.lang}.po`);
  const text = readFileSync(poPath, "utf-8").replace(/\r\n/g, "\n");
  const header = poHeaderLines(text);
  const entries = parsePo(text).filter((e) => e.msgid);
  const logPath = join(TMP_DIR, `po_translate_${o.lang}.log`);
  const jsonlPath = join(TMP_DIR, `po_translate_${o.lang}.jsonl`);

  const targets: Target[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.msgstr.trim()) continue;
    targets.push({ idx: i, entry: e });
  }
  // --start-line трактуется как порядковый индекс ЗАПИСИ (не строки файла):
  // резюм без флагов = с начала, точный докачка — по индексу из лога.
  const startIdx = o.startLine > 0 ? targets.findIndex((t) => t.idx >= o.startLine) : 0;
  const queue = (startIdx >= 0 ? targets.slice(startIdx) : targets).slice(0, o.limit || undefined);

  const totalEmpty = targets.length;
  console.log(`${poPath}: непереведённых ${totalEmpty}, к переводу в этом прогоне ${queue.length}`);
  console.log(
    `язык: ${profile.name} | модель: ${o.model} | судья: ${o.judge ? `вкл (порог ${o.threshold})` : "выкл"} | параллелизм: ${o.concurrency}`,
  );
  if (o.dry) {
    queue
      .slice(0, 10)
      .forEach((t) =>
        console.log(
          `  [${t.idx}] ${t.entry.msgid.slice(0, 70)}  <- тон: ${pot.emotion(t.entry.msgctxt, t.entry.msgid) ?? "-"}`,
        ),
      );
    console.log("(dry-run — ничего не переведено; тон показан из POT через pot_resolve)");
    return;
  }

  // Старт с места: висячий флаг прошлого стопа снимаем, кладём pid-файл.
  rmSync(STOP_FLAG(o.lang), { force: true });
  writeFileSync(PID_FILE(o.lang), String(process.pid), "utf-8");

  let translated = 0;
  let rejected = 0;
  let judgeSum = 0;
  let judgeN = 0;
  let dirty = 0;
  let cursor = 0;
  const t0 = Date.now();

  const flush = (): void => {
    if (!dirty) return;
    writeFileSync(poPath, renderPo(entries, header), "utf-8");
    dirty = 0;
  };

  const worker = async (): Promise<void> => {
    for (;;) {
      // Чистый стоп по требованию: флаг виден → дорабатываем только
      // УЖЕ взятые записи (сейчас = ничего), выходим, main сбросит файл.
      if (stopRequested(o.lang)) return;
      const i = cursor++;
      if (i >= queue.length) return;
      const { idx, entry } = queue[i];
      const ctxAt = (k: number): string[] => {
        const x = entries[idx + k];
        return x ? [`${x.msgctxt || ""} ${x.msgid}`] : [];
      };
      try {
        const r = await translateEntry(
          o.baseUrl,
          o.model,
          o.lang,
          entry,
          [...ctxAt(-2), ...ctxAt(-1)],
          [...ctxAt(1), ...ctxAt(2)],
          o.judge,
          o.threshold,
          pot.emotion(entry.msgctxt, entry.msgid),
        );
        if (r.tr) {
          entry.msgstr = r.tr;
          translated++;
          dirty++;
          if (r.judgeScore >= 0) {
            judgeSum += r.judgeScore;
            judgeN++;
          }
          appendFileSync(
            jsonlPath,
            JSON.stringify({ lang: o.lang, msgid: r.msgid, msgstr: r.tr, judge: r.judgeScore, tries: r.tries }) + "\n",
          );
        } else {
          rejected++;
          appendFileSync(
            jsonlPath,
            JSON.stringify({ lang: o.lang, msgid: r.msgid, rejected: true, issues: r.issues, judge: r.judgeScore }) +
              "\n",
          );
        }
        const done = translated + rejected;
        if (done % 5 === 0) {
          const sec = (Date.now() - t0) / 1000;
          console.log(
            `  [${done}/${queue.length}] ok=${translated} rejected=${rejected} ${(sec / done).toFixed(1)}с/зап` +
              (judgeN ? ` судья≈${(judgeSum / judgeN).toFixed(1)}` : ""),
          );
        }
        if (dirty >= o.flushEvery) flush();
      } catch (e) {
        rejected++;
        console.error(`  СБОЙ [${idx}]: ${String(e).slice(0, 200)}`);
        appendFileSync(jsonlPath, JSON.stringify({ lang: o.lang, msgid: entry.msgid, error: String(e) }) + "\n");
      }
    }
  };

  process.on("SIGINT", () => {
    flush();
    rmSync(PID_FILE(o.lang), { force: true });
    process.exit(130);
  });
  let stopped = false;
  try {
    await Promise.all(Array.from({ length: o.concurrency }, () => worker()));
    stopped = stopRequested(o.lang);
  } finally {
    flush();
    rmSync(STOP_FLAG(o.lang), { force: true });
    rmSync(PID_FILE(o.lang), { force: true });
  }

  const sec = (Date.now() - t0) / 1000;
  const summary =
    `${stopped ? "ОСТАНОВЛЕН по запросу (чекпоинт): " : ""}${poPath}: переведено ${translated}, отклонено (в отчёт) ${rejected}, из ${queue.length} в прогоне; ` +
    `осталось пустых в файле: ~${totalEmpty - translated}; время ${sec.toFixed(0)}с` +
    (judgeN ? `; судья средний ${(judgeSum / judgeN).toFixed(2)}/10` : "");
  console.log(summary);
  appendFileSync(logPath, `${new Date().toISOString()} ${summary}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
