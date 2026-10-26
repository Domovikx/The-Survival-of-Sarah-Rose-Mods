/**
 * lmstudio_idle.mts — выгружает модель LM Studio, если она простаивает.
 *
 * Проблема: LM Studio стартует автозагрузкой и держит ~6.5 ГБ VRAM, пока
 * владелец забывает его выключить. Этот скрипт сам гасит нагрузку.
 *
 * Как узнаёт простой: читает СЕРВЕРНЫЙ лог LM Studio
 * (`~/.lmstudio/server-logs/YYYY-MM/YYYY-MM-DD.N.log`) и берёт последнюю
 * строку `Received request: POST to /v1/...` с меткой времени. Это позволяет
 * НЕ трогать ни один вызывающий скрипт (po_translate / commit_msg /
 * emotion_tag) — сигнал читается там, где его пишет сам LM Studio.
 *
 * Безопасность: пока идёт очередь перевода, в лог сыплются запросы —
 * простоя нет, выгрузки не будет. Никогда не выгружает «на глазок»:
 * если данные не прочитались — выходим без действий.
 *
 * Использование:
 *   node scripts/lmstudio_idle.mts                  # один прогон (для Task Scheduler)
 *   node scripts/lmstudio_idle.mts --minutes 15     # порог простоя
 *   node scripts/lmstudio_idle.mts --dry            # только отчёт, не выгружать
 *   node scripts/lmstudio_idle.mts --watch          # постоянный цикл (раз в 60с)
 *   node scripts/lmstudio_idle.mts --stop-server    # + погасить сервер целиком
 *
 * Плановая задача Windows (каждые 10 мин):
 *   schtasks /Create /TN "LM Studio idle" /SC MINUTE /MO 10 /TR "<путь>\scripts\lmstudio_idle.cmd"
 *
 * Выход: 0 — ок (в т.ч. «действий не требуется»), 1 — ошибка исполнения.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, closeSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();
const LOG_DIR = join(homedir(), ".lmstudio", "server-logs");
const LMS = join(homedir(), ".lmstudio", "bin", "lms.exe");
const IDLE_LOG = join(REPO, "tmp", "lmstudio_idle.log");
/** Сколько байт с конца лога читаем в первую очередь (ротация ~10 МБ). */
const TAIL_BYTES = 4 * 1024 * 1024;
/** Сколько свежих файлов лога просматриваем, пока не найдём запрос. */
const MAX_LOG_FILES = 4;
/** Интервал цикла --watch, мс. */
const WATCH_MS = 60_000;

/** Метка времени последнего запроса к серверу; null — данных нет. */
const REQ_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\][^\n]*Received request: POST to \/v1\//;

/** Метка времени последнего запроса в тексте лога (или null). */
export function parseLastRequest(text: string): Date | null {
  let last: Date | null = null;
  for (const line of text.split("\n")) {
    const m = REQ_RE.exec(line);
    if (m) last = new Date(m[1].replace(" ", "T"));
  }
  return last && !Number.isNaN(last.getTime()) ? last : null;
}

export type Decision = "no-model" | "busy" | "active" | "idle" | "unknown";

/** Решение по состоянию модели и возрасту простоя.
 *
 * `busy` — статус из `lms ps` (generating/processingprompt): это ВТОРОЙ,
 * независимый сигнал активности. Он обязателен: 2026-10-26 лог врал
 * (сортировка файлов по имени дала более старую метку) и демон снял модель
 * посреди работы очереди. Лог может врать — статус генерации не врёт.
 */
export function decide(
  input: { loaded: boolean; busy: boolean; lastRequest: Date | null },
  thresholdMs: number,
  now = Date.now(),
): Decision {
  if (!input.loaded) return "no-model";
  if (input.busy) return "busy";
  if (!input.lastRequest) return "unknown";
  return now - input.lastRequest.getTime() >= thresholdMs ? "idle" : "active";
}

/** `1ч 05м` / `7м` — для читаемого отчёта. */
export function formatIdle(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}м`;
  return `${Math.floor(min / 60)}ч ${String(min % 60).padStart(2, "0")}м`;
}

/** Свежие файлы логов по МОМЕНТУ ИЗМЕНЕНИЯ (mtime), а не по имени:
 * номера файлов ротации не монотонны — `2026-10-26.4.log` может быть
 * старше `.3.log`, и сортировка по имени отдала бы трёхчасовой хвост. */
function newestLogs(limit: number): string[] {
  const entries: { path: string; mtime: number }[] = [];
  for (const m of readdirSync(LOG_DIR)) {
    if (!/^\d{4}-\d{2}$/.test(m)) continue;
    const dir = join(LOG_DIR, m);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".log")) continue;
      const p = join(dir, f);
      entries.push({ path: p, mtime: statSync(p).mtimeMs });
    }
  }
  return entries
    .toSorted((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map((e) => e.path);
}

/** Хвост файла без чтения 20 МБ целиком. */
function readTail(path: string, bytes: number): string {
  const size = statSync(path).size;
  const start = Math.max(0, size - bytes);
  const len = size - start;
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, start);
    return buf.toString("utf-8");
  } finally {
    closeSync(fd);
  }
}

/** Последний (МАКСИМАЛЬНЫЙ) запрос среди всех файлов: сначала хвост файла,
 * при неудаче — весь файл. Возвращается МАКСИМУМ, а не первый найденный:
 * порядок файлов ненадёжен (ротация), «первый» = «возможно, трёхчасовой».
 * Оба чтения подставляются через аргументы, чтобы тест видел реальный
 * поток вызовов. */
export function findLastRequest(
  logPaths: string[],
  readTailOf: (p: string) => string,
  readFullOf: (p: string) => string,
): Date | null {
  let best: Date | null = null;
  for (const p of logPaths) {
    let ts: Date | null = null;
    try {
      ts = parseLastRequest(readTailOf(p));
    } catch {
      ts = null;
    }
    if (!ts) {
      // в хвосте запросов нет — возможно, они старше окна: читаем весь файл
      try {
        ts = parseLastRequest(readFullOf(p));
      } catch {
        /* файл пропал/не читается — идём дальше */
      }
    }
    if (ts && (!best || ts.getTime() > best.getTime())) best = ts;
  }
  return best;
}

function readFull(path: string): string {
  return readTail(path, statSync(path).size);
}

function lms(args: string[]): string {
  return execFileSync(LMS, args, { encoding: "utf-8", maxBuffer: 16 * 1024 * 1024 });
}

/** Загружена ли хоть одна модель. */
function loadedModels(): { id: string; status: string }[] {
  try {
    const raw = lms(["ps", "--json"]).trim();
    if (!raw) return [];
    const arr = JSON.parse(raw) as Array<{ identifier?: string; status?: string }>;
    return arr.map((m) => ({ id: m.identifier ?? "?", status: m.status ?? "?" }));
  } catch {
    return [];
  }
}

function log(line: string): void {
  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  try {
    appendFileSync(IDLE_LOG, `[${stamp}] ${line}\n`, "utf-8");
  } catch {
    /* tmp/ может отсутствовать — печать ниже всё равно идёт в stdout */
  }
  console.log(`[lmstudio:idle] ${line}`);
}

/** Один прогон. Возвращает true, если модель была выгружена. */
async function runOnce(thresholdMs: number, dry: boolean, stopServer: boolean): Promise<boolean> {
  const models = loadedModels();
  // логи читаем ОДИН раз на прогон (не дважды: решение + отчёт)
  const logs = newestLogs(MAX_LOG_FILES);
  const last = findLastRequest(logs, (p) => readTail(p, TAIL_BYTES), readFull);
  // busy — независимый сигнал: считаем занятым ВСЁ, кроме явного "idle"
  // (неизвестный статус => занята => не выгружаем: в этой задаче безопаснее
  // ошибиться в сторону «не трогать», чем снять модель посреди генерации).
  const busy = models.some((m) => !/^idle$/i.test(m.status.trim()));
  const decision = decide({ loaded: models.length > 0, busy, lastRequest: last }, thresholdMs);

  if (decision === "no-model") return false; // нечего выгружать — тихо
  if (decision === "busy") return false; // идёт генерация — не мешаем
  if (decision === "unknown") {
    log("нет данных о запросах в логе — не рискую, ничего не делаю");
    return false;
  }
  if (decision === "active") return false; // работает — не мешаем, в лог не пишем

  const idle = formatIdle(Date.now() - (last?.getTime() ?? Date.now()));
  const what = models.map((m) => `${m.id} (${m.status})`).join(", ");

  if (dry) {
    log(`[dry] простой ${idle} — выгрузил бы: ${what}`);
    return false;
  }

  try {
    lms(["unload", "--all"]);
  } catch (e) {
    log(`ошибка выгрузки: ${String(e).slice(0, 160)}`);
    return false;
  }
  const after = loadedModels();
  if (after.length) {
    log(`выгрузка не подтвердилась, всё ещё загружено: ${after.map((m) => m.id).join(", ")}`);
    return false;
  }
  log(`простой ${idle} — выгружено: ${what} (VRAM освобождена)`);
  if (stopServer) {
    try {
      lms(["server", "stop"]);
      log("сервер LM Studio остановлен");
    } catch (e) {
      log(`не удалось остановить сервер: ${String(e).slice(0, 160)}`);
    }
  }
  return true;
}

// ── CLI ──────────────────────────────────────────────────────────────────
function parseArgs(argv: string[]): { minutes: number; dry: boolean; watch: boolean; stopServer: boolean } {
  const f = (name: string, def: string): string => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
  };
  return {
    minutes: Math.max(0, Number(f("minutes", "10"))),
    dry: argv.includes("--dry"),
    watch: argv.includes("--watch"),
    stopServer: argv.includes("--stop-server"),
  };
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("lmstudio_idle.mts") ?? false;

if (invokedDirectly) {
  const o = parseArgs(process.argv.slice(2));
  const thresholdMs = o.minutes * 60_000;
  console.log(`[lmstudio:idle] порог ${o.minutes}м${o.dry ? " | DRY" : ""}${o.watch ? " | режим --watch" : ""}`);
  await runOnce(thresholdMs, o.dry, o.stopServer);
  if (o.watch) {
    setInterval(() => {
      void runOnce(thresholdMs, o.dry, o.stopServer);
    }, WATCH_MS);
    console.log(`[lmstudio:idle] цикл каждые ${WATCH_MS / 1000}с (Ctrl+C — выход)`);
  }
}
