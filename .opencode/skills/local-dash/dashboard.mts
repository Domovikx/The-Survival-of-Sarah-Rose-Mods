/**
 * dashboard.mts — локальная страница «что сейчас происходит» (внутренняя, read-only).
 *
 * Одна страница без сборки и зависимостей: Node stdlib + `nvidia-smi` + файлы
 * пульта. Открыть http://127.0.0.1:8087 и смотреть: какая модель поднята,
 * сколько ест GPU/CPU/RAM, как идёт очередь переводов и что пишет прогон.
 *
 * Запуск: node .opencode/skills/local-dash/dashboard.mts [--port 8087]
 */
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readdirSync, readSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { cpus, freemem, totalmem } from "node:os";
import { pathToFileURL } from "node:url";

// Счётчики озвучки берём из единственного источника — voice_status.mts
// (в скилле tssr-voice-status считать вручную запрещено: разъедется с ним).
import {
  activeArcs,
  countDone,
  healthScan,
  plan as voicePlan,
  shimWorkers,
  voiceLangs,
} from "../../../patches/ai-voice-pack/tools/generate/scripts/voice_status.mts";

const PORT = Number(process.argv[process.argv.indexOf("--port") + 1]) || 8087;
const PO_DIR = join("patches", "ai-voice-pack", "po");
/**
 * Языки блока «текст и озвучка» — В ПОРЯДКЕ config/language-priority.json
 * (единый источник порядка языков в UI; en не показываем — у него нет po).
 * Список не сортируется по прогрессу: владельцу удобнее ревьюить в приоритете
 * языков, а не «что сейчас движется» (2026-11-19).
 */
const LANGS = ((): string[] => {
  try {
    const cfg = JSON.parse(readFileSync(join("config", "language-priority.json"), "utf-8")) as {
      languages: Array<{ code: string }>;
    };
    return cfg.languages.map((l) => l.code).filter((c) => c !== "en");
  } catch {
    return ["zh", "ru", "es", "pt", "de", "ja", "fr", "pl", "ko", "it"];
  }
})();
/**
 * Версия формата /api/state. Страница, открытая до перезапуска пульта, иначе
 * работает со старым JS и выводит «undefined» для новых полей (2026-11-16).
 * Поднимать при ЛЮБОМ изменении набора полей.
 */
const API_VER = 43;

/** Прошлые значения CPU/RAM для дельты. */
const prevCpu = cpus().map((c) => c.times);
let memPeak = 0;

const shell = (bin: string, args: string[], timeout = 2000): string => {
  const r = spawnSync(bin, args, { encoding: "utf-8", timeout });
  return `${r.stdout ?? ""}`.trim();
};

/** Проценты: суммарная загрузка CPU (дельта тиков). */
const cpuPercent = (): number => {
  const now = cpus();
  let idle = 0;
  let total = 0;
  now.forEach((c, i) => {
    const before = prevCpu[i];
    if (!before) return;
    const t = c.times;
    idle += t.idle - before.idle;
    total +=
      t.user - before.user + t.nice - before.nice + t.sys - before.sys + t.irq - before.irq + (t.idle - before.idle);
  });
  now.forEach((c, i) => (prevCpu[i] = c.times));
  return total > 0 ? Math.round(100 - (idle / total) * 100) : 0;
};

type GpuInfo = { util: number; usedMiB: number; totalMiB: number; tempC: number };
let gpuCache: { at: number; value: GpuInfo | null } = { at: 0, value: null };
/** Объём VRAM не меняется — узнаём один раз и больше nvidia-smi не зовём. */
let gpuTotalMiB = 0;

/**
 * GPU для карточки. ГЛАВНОЕ: пульт не должен запускать `nvidia-smi` на каждый
 * опрос страницы — каждый запуск это процесс + conhost, и в Task Manager это
 * воспринималось как постоянная активность процесса (5.6 % ядра, замер 2026-11-17).
 * Живые значения берём из `tmp/health.csv` (его пишет страж раз в 15 с), а
 * nvidia-smi остаётся только фолбэком, когда стража нет.
 */
const gpu = (): GpuInfo | null => {
  const h = health();
  const last = h.samples.at(-1);
  if (last) {
    if (!gpuTotalMiB) {
      // Один раз за жизнь процесса (дальше объём берём из кэша).
      const out = shell("nvidia-smi", ["--query-gpu=memory.total", "--format=csv,noheader,nounits"]);
      gpuTotalMiB = Number(out.trim()) || 0;
    }
    return {
      util: Number.isFinite(last.gpuUtil) ? last.gpuUtil : 0,
      usedMiB: Number.isFinite(last.vramMiB) ? last.vramMiB : 0,
      totalMiB: gpuTotalMiB,
      tempC: last.gpuTemp,
    };
  }
  if (Date.now() - gpuCache.at < 5000) return gpuCache.value;
  const out = shell("nvidia-smi", [
    "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
    "--format=csv,noheader,nounits",
  ]);
  const parts = out
    .split(/\r?\n/)[0]
    ?.split(",")
    .map((x) => Number(x.trim()));
  if (!parts || parts.length < 4 || parts.some(Number.isNaN)) return null;
  const value = { util: parts[0]!, usedMiB: parts[1]!, totalMiB: parts[2]!, tempC: parts[3]! };
  gpuTotalMiB = value.totalMiB;
  gpuCache = { at: Date.now(), value };
  return value;
};

const probe = async (port: number): Promise<{ up: boolean; model?: string }> => {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/v1/models`, { signal: AbortSignal.timeout(1200) });
    if (!r.ok) return { up: false };
    const data = (await r.json()) as { data?: Array<{ id?: string }> };
    return { up: true, model: data.data?.[0]?.id };
  } catch {
    return { up: false };
  }
};

/**
 * Счётчики po: 10 файлов по 15 МБ. Читаем их ТОЛЬКО из кэша, а промах отдаём
 * как `null` (UI пишет «—») и считаем в фоне: иначе первый запрос после старта
 * платит за все 10 файлов и висит ~2-3 с (замерено 2026-11-16).
 */
type PoStat = { filled: number; total: number };
const poCache = new Map<string, PoStat & { at: number }>();
const poBusy = new Set<string>();
/** Язык, который переводится прямо сейчас: его po читаем чаще (скорость/ETA). */
let currentLang = "";

/**
 * Счётчик po по тексту файла. Вынесен чистой функцией ради теста (2026-11-16:
 * тут был занижённый на 1 результат из-за шапки файла и переводов из одного
 * символа вроде `msgstr "A"`).
 */
export const countPo = (text: string): PoStat => {
  // Шапку po отрезаем: её `msgstr ""` — заголовок файла, а не пустая строка
  // (в шапке ещё и многострочный msgstr, который ломал счёт).
  const body = text.replace(/^[\s\S]*?\n\n/, "");
  const total = (body.match(/^msgid /gm) ?? []).length;
  const empty = (body.match(/^msgstr ""$/gm) ?? []).length;
  return { filled: total - empty, total };
};

const refreshPo = (lang: string): PoStat | null => {
  const file = join(PO_DIR, `${lang}.po`);
  if (!existsSync(file)) return null;
  return countPo(readFileSync(file, "utf-8"));
};

const poStats = (lang: string): PoStat | null => {
  const cached = poCache.get(lang);
  // Наружу отдаём только {filled,total} — служебный `at` клиенту не нужен.
  const plain = (): PoStat | null => (cached ? { filled: cached.filled, total: cached.total } : null);
  // TTL: 120 с для «холодных» языков (10 файлов по 15 МБ не читаем без нужды),
  // 15 с — для языка, который ПЕРЕВОДИТСЯ сейчас: по его приросту считается
  // скорость и ETA. Долгий кэш давал «0 стр/мин» почти на каждом замере, потому
  // что окно замера (30 с) короче кэша (2026-11-19).
  const ttl = lang === currentLang ? 15_000 : 120_000;
  if (cached && Date.now() - cached.at < ttl) return plain();
  if (!poBusy.has(lang)) {
    poBusy.add(lang);
    setImmediate(() => {
      try {
        const prev = poCache.get(lang);
        const fresh = refreshPo(lang);
        if (fresh) {
          poCache.set(lang, { at: Date.now(), ...fresh });
          if (lang === currentLang) {
            progressHistory.push({ t: new Date().toISOString(), v: fresh.filled });
            while (progressHistory.length > 400) progressHistory.shift();
          }
          noteProgress(lang, prev, fresh);
        }
      } finally {
        poBusy.delete(lang);
      }
    });
  }
  // Есть старый кэш — отдаём его (пока свежий считается); нет — null → в UI «—».
  return plain();
};

const queueState = (): Record<string, unknown> | null => {
  try {
    return JSON.parse(readFileSync(join("tmp", "translate_queue.json"), "utf-8"));
  } catch {
    return null;
  }
};

/**
 * Хвост лога языка. ЧИТАЕМ ТОЛЬКО КОНЕЦ ФАЙЛА: раньше здесь был readFileSync
 * целиком, а `translate_<lang>.run.log` дорастает до 29 МБ — и это читалось на
 * каждый опрос страницы (раз в 2 с, около 15 МБ/с). Это была основная причина
 * высокой нагрузки процесса (замер 2026-11-18: 10 167 CPU-секунд за 14 часов).
 */
const logTail = (lang: string, lines = 8): string[] => {
  const file = join("tmp", `translate_${lang}.run.log`);
  let fd: number | null = null;
  try {
    fd = openSync(file, "r");
    const size = statSync(file).size;
    const len = Math.min(size, 128 * 1024);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    return buf
      .toString("utf-8")
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.startsWith("  "))
      .slice(-lines);
  } catch {
    return [];
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        /* уже закрыт */
      }
    }
  }
};

/**
 * История числа слотов llama-server (`tmp/np_history.csv`, пишет np_switch).
 * Нужна, чтобы видеть: сейчас 4 или 8, и когда режим менялся (днём за ПК —
 * 4, отошёл — 8).
 */
const npHistory = (): { current: number | null; points: Array<{ t: string; v: number }> } => {
  const file = join("tmp", "np_history.csv");
  if (!existsSync(file)) return { current: null, points: [] };
  try {
    const rows = readFileSync(file, "utf-8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => l.split(","))
      .filter((c) => c.length >= 2)
      .map((c) => ({ t: c[0]!, v: Number(c[1]) }))
      .filter((p) => Number.isFinite(p.v));
    const sorted = rows.toSorted((a, b) => Date.parse(a.t) - Date.parse(b.t));
    return { current: sorted.length ? sorted[sorted.length - 1]!.v : null, points: sorted.slice(-240) };
  } catch {
    return { current: null, points: [] };
  }
};

let procCache: { at: number; value: { llamaMB: number; nodeMB: number; nodeCount: number } } = {
  at: 0,
  value: { llamaMB: 0, nodeMB: 0, nodeCount: 0 },
};

/**
 * Здоровье ПК из `tmp/health.csv` (его пишет `scripts/health_guard.mts` каждые
 * 15 с). Нужен график «что было до сброса»: Windows при жёстком ребуте не
 * оставляет дампа, и единственный след — наши собственные замеры.
 * Кэш по mtime: файл растёт, а опрос страницы идёт раз в 2 с.
 */
const healthCache = {
  at: 0,
  mtime: 0,
  value: {
    samples: [] as HealthSample[],
    stops: 0,
    lastStop: null as { t: string; note: string } | null,
    events: [] as Array<{ t: string; kind: string }>,
  },
};
interface HealthSample {
  t: string;
  gpuTemp: number;
  gpuPower: number;
  gpuUtil: number;
  ramFreePct: number;
  ramFreeGb: number;
  cpu: number;
  /** Занятая VRAM (МиБ) — из той же строки health.csv, чтобы не звать nvidia-smi. */
  vramMiB: number;
}
const health = (): {
  samples: HealthSample[];
  stops: number;
  lastStop: { t: string; note: string } | null;
  events: Array<{ t: string; kind: string; note?: string }>;
} => {
  const file = join("tmp", "health.csv");
  if (!existsSync(file)) return { samples: [], stops: 0, lastStop: null, events: [] };
  const mtime = statSync(file).mtimeMs;
  if (mtime === healthCache.mtime && Date.now() - healthCache.at < 30_000) return healthCache.value;
  const lines = readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean);
  const samples: HealthSample[] = [];
  const events: Array<{ t: string; kind: string; note?: string }> = [];
  let stops = 0;
  let lastStop: { t: string; note: string } | null = null;
  let prevNote = "";
  for (const line of lines.slice(-400)) {
    const c = line.split(",");
    if (c[1] === "GUARD") {
      stops++;
      // Причина остановки — в примечании предыдущего замера (RAM_МАЛО / GPU_ЖАР…).
      lastStop = { t: c[0] ?? "", note: prevNote || "порог" };
      if (c[0]) events.push({ t: c[0], kind: "guard", note: prevNote || "порог" });
      continue;
    }
    const temp = Number(c[1]);
    if (!Number.isFinite(temp)) continue;
    prevNote = (c[10] ?? "").trim();
    samples.push({
      t: c[0] ?? "",
      gpuTemp: temp,
      gpuPower: Number(c[2]),
      gpuUtil: Number(c[4]),
      ramFreePct: Number(c[7]),
      ramFreeGb: Number(c[8]),
      cpu: Number(c[6]),
      vramMiB: Number(c[5]),
    });
  }
  // Старты бэкенда: по логу очереди. Так на графике видно «здесь прогон стоял,
  // потому что llama-server упал и его поднимали» — главный вопрос после сбоя.
  try {
    const qlog = readFileSync(join("tmp", "translate_queue.log"), "utf-8");
    for (const m of qlog.matchAll(/^(\S+Z) бэкенд лежит — запускаю llama-server$/gm)) {
      if (m[1]) events.push({ t: m[1], kind: "backend" });
    }
  } catch {
    /* лога нет — просто не будет меток */
  }
  const value = { samples: samples.slice(-240), stops, lastStop, events };
  healthCache.at = Date.now();
  healthCache.mtime = mtime;
  healthCache.value = value;
  return value;
};

/**
 * Процесс озвучки «сейчас»: запущен ли `voice_batch`, какой язык, сколько уже
 * сделано из плана, скорость и ETA. Данные — из процесса (StartTime + cmdline),
 * из лога батча (строка «фраз к генерации: N») и по mtime файлов в audio/<lang>.
 * Кэш 12 с: обход ~1.3 тыс. файлов на язык не должен идти на каждый опрос.
 */
const voiceRunCache: { at: number; value: VoiceRun | null } = { at: 0, value: null };
interface VoiceRun {
  running: boolean;
  lang: string;
  total: number | null;
  done: number | null;
  perMin: number | null;
  etaMin: number | null;
  current: string | null;
  workers: number;
}
const voiceRun = (): VoiceRun | null => {
  if (Date.now() - voiceRunCache.at < 12_000) return voiceRunCache.value;
  const ps = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'voice_batch' } | Select-Object -First 1 | ForEach-Object { $_.ProcessId.ToString() + '|' + $_.CreationDate.ToString('o') + '|' + $_.CommandLine }",
    ],
    { encoding: "utf-8", timeout: 15_000, windowsHide: true },
  );
  const line = String(ps.stdout ?? "").trim();
  const workers = shimWorkers();
  if (!line) {
    const value =
      workers > 0
        ? { running: false, lang: "", total: null, done: null, perMin: null, etaMin: null, current: null, workers }
        : null;
    voiceRunCache.at = Date.now();
    voiceRunCache.value = value;
    return value;
  }
  const [pid, iso, cmdline] = line.split("|");
  const lang = /--lang\s+(\S+)/.exec(cmdline ?? "")?.[1] ?? "";
  const startMs = Date.parse(iso ?? "");
  const base = join("patches", "ai-voice-pack", "audio", lang);
  let done = 0;
  let newest: { m: number; n: string } | null = null;
  try {
    for (const arc of readdirSync(base)) {
      const dir = join(base, arc);
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".opus")) continue;
        const m = statSync(join(dir, f)).mtimeMs;
        if (!Number.isFinite(startMs) || m >= startMs) done++;
        if (!newest || m > newest.m) newest = { m, n: f };
      }
    }
  } catch {
    /* папка ещё не создана */
  }
  // План берём из лога батча: «фраз к генерации: N».
  let total: number | null = null;
  try {
    const log = readFileSync(
      join("patches", "ai-voice-pack", "tools", "generate", "output", "voice", "batch.log"),
      "utf-8",
    );
    const m = [...log.matchAll(/фраз к генерации: (\d+)/g)].at(-1);
    if (m) total = Number(m[1]);
  } catch {
    /* лога нет */
  }
  const minutes = Number.isFinite(startMs) ? Math.max(0.1, (Date.now() - startMs) / 60_000) : 0;
  const perMin = done > 0 && minutes > 0 ? Math.round((done / minutes) * 10) / 10 : null;
  const value: VoiceRun = {
    running: true,
    lang,
    total,
    done,
    perMin,
    etaMin: total && perMin ? Math.max(0, Math.round((total - done) / perMin)) : null,
    current: newest?.n ?? null,
    workers,
  };
  void pid;
  voiceRunCache.at = Date.now();
  voiceRunCache.value = value;
  return value;
};

const processRam = (): { llamaMB: number; nodeMB: number; nodeCount: number } => {
  if (Date.now() - procCache.at < 6000) return procCache.value;
  const out = shell(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      'Get-Process llama-server,node -ErrorAction SilentlyContinue | ForEach-Object { "{0},{1}" -f $_.ProcessName,[int]($_.WorkingSet64/1MB) }',
    ],
    4000,
  );
  let llamaMB = 0;
  let nodeMB = 0;
  let nodeCount = 0;
  for (const line of out.split(/\r?\n/)) {
    const [name, mb] = line.split(",");
    if (!name || !mb) continue;
    if (name === "llama-server") llamaMB += Number(mb);
    if (name === "node") {
      nodeMB += Number(mb);
      nodeCount++;
    }
  }
  const value = { llamaMB, nodeMB, nodeCount };
  procCache = { at: Date.now(), value };
  return value;
};

/**
 * История ПРОГРЕССА текущего языка: (время, сколько строк переведено). Клиент
 * режет её на интервалы и показывает «сколько строк за 2 минуты» — это объём
 * работы, а не мгновенная скорость, которая скачет от батчей записи po
 * (2026-11-19). Сбрасывается при смене языка: чужие строки в графике — враньё.
 */
const progressHistory: Array<{ t: string; v: number }> = [];
let progressLang = "";
/**
 * Последняя посчитанная скорость. Без кэша число живёт ОДИН запрос (тот, что
 * перешагнул окно 30 с), а остальные 14 из 15 опросов снова показывали «…» —
 * скорость отображалась нестабильно (замечено 2026-11-16).
 */
let rateCache: { lang: string; perMin: number; at: number } | null = null;

/**
 * Скорость считаем ПО ФАКТУ чтения po: окно = реальный интервал между двумя
 * перечитываниями файла. Раньше её мерили по опросу страницы (окно 30 с), но
 * кэш po живёт 120 с (сейчас 15 с для текущего языка) — окно оказывалось то
 * нулевым, то «прыжком», и пульт показывал «0 стр/мин» при живом прогоне
 * (2026-11-19). Здесь окно всегда настоящее, дельты — только по своему языку.
 */
function noteProgress(lang: string, prev: (PoStat & { at: number }) | undefined, fresh: PoStat): void {
  if (!prev || lang !== currentLang) return;
  const dt = Date.now() - prev.at;
  if (dt < 1_000) return;
  if (fresh.filled < prev.filled) return; // перезапись/сброс — не считаем прогрессом
  const perMin = ((fresh.filled - prev.filled) / dt) * 60_000;
  rateCache = { lang, perMin: Math.max(0, perMin), at: Date.now() };
}

type VoiceLang = { lang: string; done: number; plan: number; arcsDone: number; arcsTotal: number; bytes: number };
type VoiceStats = {
  langs: VoiceLang[];
  arcs: Array<{ arc: string; closed: number; total: number }>;
  workers: number;
  active: Record<string, string>;
  orphans: number;
  parts: number;
};

/** Обход корпуса озвучки дорогой (11 языков × ~1.2 тыс. файлов) — кэш 60 с. */
let voiceCache: { at: number; value: VoiceStats } | null = null;
/** Идёт ли сейчас пересчёт (защита от параллельных обходов). */
let voiceBusy = false;

/**
 * Сколько арок закрыто полностью (сделано ≥ план по арке). Вынесено чистой
 * функцией ради теста: 2026-11-16 здесь стояло `made.get(a) ?? 0 >= plan.get(a)`
 * — по приоритету операторов это `made.get(a) ?? (0 >= …)`, и при 2 % озвучки
 * все 19 арок показывались закрытыми.
 */
export const arcsClosed = (made: Map<string, number>, plan: Map<string, number>): number => {
  let n = 0;
  for (const [arc, planN] of plan) if (planN > 0 && (made.get(arc) ?? 0) >= planN) n++;
  return n;
};

/** Уступить событийный цикл: без этого синхронный обход корпуса блокирует ответы. */
const yieldTick = (): Promise<void> => new Promise((r) => setImmediate(r));

/**
 * Полный обход корпуса озвучки. Дорогой (холодный старт ~9 с: 11 языков ×
 * разбор POT+po, обход 13 тыс. файлов), поэтому считается ДОЛЬКАМИ по языкам:
 * между языками уступаем событийный цикл, иначе сервер не отвечает вообще
 * (проверено 2026-11-16: первый запрос ждал 8.9 с).
 */
const computeVoice = async (): Promise<VoiceStats> => {
  if (voiceBusy) return voiceCache?.value ?? emptyVoice();
  voiceBusy = true;
  try {
    const h = healthScan();
    const arcsSet = new Set<string>();
    // plan/countDone — дорогие (обход корпуса + разбор po): считаем ОДИН раз на
    // язык и переиспользуем для строк языков и для сетки арок.
    const source: Array<{ lang: string; plan: Map<string, number>; made: ReturnType<typeof countDone> }> = [];
    for (const lang of voiceLangs()) {
      const plan = voicePlan(lang);
      source.push({ lang, plan, made: countDone(lang) });
      [...plan.keys()].forEach((a) => arcsSet.add(a));
      await yieldTick();
    }
    const langs: VoiceLang[] = source.map(({ lang, plan, made }) => ({
      lang,
      done: made.total,
      plan: [...plan.values()].reduce((a, b) => a + b, 0),
      arcsDone: arcsClosed(made.made, plan),
      arcsTotal: plan.size,
      bytes: h.sizes[lang] ?? 0,
    }));
    const value: VoiceStats = {
      langs,
      arcs: [...arcsSet].toSorted().map((arc) => {
        const total = source.filter((x) => (x.plan.get(arc) ?? 0) > 0).length;
        const closed = source.filter(({ plan, made }) => {
          const p = plan.get(arc) ?? 0;
          return p > 0 && (made.made.get(arc) ?? 0) >= p;
        }).length;
        return { arc, closed, total };
      }),
      workers: shimWorkers(),
      active: Object.fromEntries(activeArcs()),
      orphans: h.orphans,
      parts: h.parts,
    };
    voiceCache = { at: Date.now(), value };
    return value;
  } finally {
    voiceBusy = false;
  }
};

const emptyVoice = (): VoiceStats => ({ langs: [], arcs: [], workers: 0, active: {}, orphans: 0, parts: 0 });

/**
 * Отдаём кэш, а если он протух — запускаем пересчёт и возвращаем `null`: UI
 * рисует «загрузка…» для блока озвучки и получает цифры со следующего опроса.
 */
const voiceStatsAsync = (): VoiceStats | null => {
  if (voiceCache && Date.now() - voiceCache.at < 600_000) return voiceCache.value;
  void computeVoice();
  return null;
};

/**
 * Замер ряда прогресса (график «Скорость перевода»). Идёт по таймеру, а не по
 * запросам страницы: иначе ряд рвётся, когда пульт закрыт (2026-11-19). Язык
 * берём из состояния очереди — без открытой вкладки currentLang пустой.
 */
const sampleTick = (): void => {
  if (!currentLang) {
    const q = queueState();
    currentLang = typeof q?.lang === "string" ? (q.lang as string) : "";
  }
  if (currentLang) poStats(currentLang);
};

const state = async (): Promise<Record<string, unknown>> => {
  const cpu = cpuPercent();
  const memTotal = Math.round(totalmem() / 1024 / 1024);
  const memFree = Math.round(freemem() / 1024 / 1024);
  const memUsed = memTotal - memFree;
  memPeak = Math.max(memPeak, memUsed);

  const [translate, lmstudio, strata] = await Promise.all([probe(8081), probe(1234), probe(8080)]);
  const queue = queueState();
  const current = typeof queue?.lang === "string" ? (queue.lang as string) : "";
  // Текущий язык знает poStats: для него кэш короче, иначе скорость и ETA
  // считались по цифре, обновляемой раз в две минуты (пульт показывал
  // «0 стр/мин» и «осталось —» при живом прогоне, 2026-11-19).
  currentLang = current;
  // Смена языка: история прогресса прошлого языка в графике — мусор.
  if (current !== progressLang) {
    progressHistory.length = 0;
    progressLang = current;
  }

  const live = current ? poStats(current) : null;
  // Скорость обновляет noteProgress (при перечитывании po), здесь только
  // отдаём последнее значение для текущего языка; `null` = ещё не измеряли.
  const rate: number | null =
    rateCache && rateCache.lang === current ? Math.max(0, Math.round(rateCache.perMin)) : null;

  return {
    at: new Date().toISOString(),
    v: API_VER,
    live: live
      ? {
          ...live,
          // null = сэмпла ещё нет (показываем «…», а не враньё «0 стр/мин»).
          rate,
          etaMin: rate !== null && rate > 0 ? Math.round((live.total - live.filled) / rate) : null,
        }
      : null,
    system: { cpu, memUsed, memTotal, memPeak },
    gpu: gpu(),
    health: health(),
    proc: processRam(),
    servers: {
      translate: { ...translate, url: "127.0.0.1:8081" },
      lmstudio: { ...lmstudio, url: "127.0.0.1:1234" },
      strata: { ...strata, url: "127.0.0.1:8080" },
    },
    queue: queue ? { ...queue, current } : null,
    languages: LANGS.map((lang) => ({ lang, po: poStats(lang) })),
    voice: voiceStatsAsync(),
    voiceRun: voiceRun(),
    tail: current ? logTail(current, 8) : [],
    np: npHistory(),
    progress: current ? progressHistory.slice(-300) : [],
    files: { logs: existsSync("tmp") ? readdirSync("tmp").filter((f) => f.endsWith(".run.log")).length : 0 },
  };
};

const PAGE = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>TSSR · пульт</title>
<style>
  :root { color-scheme: dark; font-variant-numeric: tabular-nums; --bg:#111417; --panel:#171c21; --line:#252c33; --fg:#e6edf3; --muted:#8b98a5; --ok:#3fb950; --bad:#f85149; --warn:#d29922; }
  * { box-sizing: border-box; }
  body { margin:0; padding:14px; background:var(--bg); color:var(--fg); font:14px/1.45 ui-monospace,Consolas,monospace; }
  h1 { font-size:15px; font-weight:600; margin:0 0 14px; color:var(--muted); letter-spacing:.04em; text-transform:uppercase; }
  .grid { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:10px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:10px 12px; min-width:0; }
  .c3 { grid-column:span 3; } .c4 { grid-column:span 4; } .c5 { grid-column:span 5; }
  .c6 { grid-column:span 6; } .c7 { grid-column:span 7; } .c8 { grid-column:span 8; }
  .c12 { grid-column:1 / -1; }
  /* Узкий экран: 12 колонок нечитаемы — складываем в две. */
  @media (max-width:1100px) {
    .grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .c3,.c4,.c5,.c6,.c7,.c8 { grid-column:span 1; }
    .c12 { grid-column:1 / -1; }
  }
  .card h2 { font-size:11px; margin:0 0 10px; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; }
  .row { display:flex; justify-content:space-between; gap:12px; padding:2px 0; }
  /* Длинные значения (имя модели) не вылезают за карточку: ужимаем с многоточием. */
  .row > span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .row > span:last-child { text-align:right; }
  .v { color:#fff; }
  .ok { color:var(--ok); } .bad { color:var(--bad); } .warn { color:var(--warn); } .muted { color:var(--muted); }
  .bar { height:6px; background:#0c0f12; border-radius:3px; overflow:hidden; margin:4px 0 8px; }
  .bar > i { display:block; height:100%; background:var(--ok); }
  .tail { white-space:pre-wrap; color:var(--muted); font-size:12px; overflow:auto; max-height:300px; }
  .big { font-size:22px; }
  .arcs { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:2px 18px; margin-top:10px; }
  /* minmax(0,1fr) + overflow:hidden обязательны: иначе длинное имя арки
     распирает ячейку и счётчик соседа наезжает на текст (поймано 2026-11-16
     на широком окне: «Other 6/11 яз.» наложилось на «PrisonArc»). */
  .arc { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:baseline; font-size:12px; min-width:0; overflow:hidden; }
  .arc > span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .arc > span:last-child { text-align:right; }
  .lingua { display:grid; grid-auto-flow:column; grid-template-rows:repeat(5,auto); grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 26px; }
  @media (max-width:1500px) { .lingua { grid-auto-flow:row; grid-template-rows:none; grid-template-columns:1fr; } }
  .ling { display:grid; grid-template-columns:40px 30px 30px minmax(0,1fr); gap:10px; align-items:center; padding:3px 0; }
  .ling > span:last-child { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ring { display:block; }
  .hint { font-size:11px; margin:2px 0 10px; }
  /* Каждый график здоровья — своя карточка (c3): на общем полотне они
     сжимались, а сравнить «в какой момент что было» удобнее по одной шкале
     в отдельной рамке (владелец 2026-11-19). */
  /* Пять равных карточек в ряд: здоровье (3) + слоты + скорость. Сетка 12
     колонок на 5 не делится, поэтому у ряда своя раскладка. */
  .row5 { grid-column:1 / -1; display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; }
  @media (max-width:1700px) { .row5 { grid-template-columns:repeat(3,minmax(0,1fr)); } }
  @media (max-width:1150px) { .row5 { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media (max-width:760px) { .row5 { grid-template-columns:1fr; } }
  #h1, #h2, #h3, #npchart, #speed { min-width:0; }
  .sp { min-width:0; overflow:hidden; }
  /* Ось времени: метки позиционируются по проценту ширины, чтобы совпадать
     с вертикальными засечками в SVG. */
  .axis { position:relative; height:13px; margin:1px 0 2px; }
  .axis span { position:absolute; top:0; font-size:10px; color:var(--muted); white-space:nowrap; }
  /* Подписи горизонтальных отметок: чуть левее края, на фоне панели, чтобы
     пунктир не просвечивал сквозь цифры. */
  .yaxis span { position:absolute; left:2px; transform:translateY(-50%); font-size:9px; line-height:1;
    color:var(--muted); background:var(--panel); padding:1px 2px; }
  .sp .lbl { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .stats { margin-top:12px; font-size:12px; }
  /* Полоса состояния: проблемы первыми, всё хорошо — одна зелёная строка. */
  .alerts { margin:0 0 10px; font-size:13px; }
  .alerts .al { padding:7px 11px; border-radius:8px; margin-bottom:6px; border:1px solid var(--line); background:var(--panel); }
  .alerts .al.bad { border-color:var(--bad); color:var(--bad); }
  .alerts .al.warn { border-color:var(--warn); color:var(--warn); }
  .alerts .al.ok { border-color:#1f6feb33; color:var(--muted); }
</style></head><body>
<h1>TSSR · локальный пульт <span id="at" class="muted"></span></h1>
<div id="alerts" class="alerts"></div>
<div class="grid">
  <div class="card c5"><h2>Очередь</h2><div id="queue"><span class="muted">загрузка…</span></div></div>
  <div class="card c3"><h2>Бэкенд перевода</h2><div id="tr"><span class="muted">загрузка…</span></div></div>
  <div class="card c4"><h2>GPU / CPU / RAM</h2><div id="sys"><span class="muted">загрузка…</span></div></div>
  <div class="row5">
    <div class="card"><h2>GPU мощность</h2><div id="h1"><span class="muted">загрузка…</span></div></div>
    <div class="card"><h2>GPU температура</h2><div id="h2"><span class="muted">загрузка…</span></div></div>
    <div class="card"><h2>RAM занято</h2><div id="h3"><span class="muted">загрузка…</span></div></div>
    <div class="card"><h2>Слоты llama (-np)</h2>
      <div id="npchart"><span class="muted">загрузка…</span></div>
      <div class="hint muted" style="margin:4px 0 0">4 — за ПК · 8 — простой &gt; 15 мин</div>
    </div>
    <div class="card"><h2>Скорость перевода</h2><div id="speed"><span class="muted">загрузка…</span></div></div>
    <div id="htime" class="hint muted" style="grid-column:1 / -1; margin:-4px 2px 0"></div>
  </div>
  <div class="card c8"><h2>Языки: текст и озвучка</h2>
    <div id="vrun" class="hint muted"></div>
    <div class="hint muted">кольца: <b>перевод</b> — от всего POT · <b>озвучка</b> — от уже переведённого (навести — точные числа)</div>
    <div id="lingua" class="lingua"><span class="muted">загрузка…</span></div>
    <div id="vhealth"></div>
    <div id="arcs" class="stats"></div>
  </div>
  <div class="card c4"><h2>Последнее в прогоне</h2><div id="tail" class="tail">…</div></div>
</div>
<script>
const $ = (id) => document.getElementById(id);
// null = знаменатель неизвестен: показываем «—», а не ложные 0 %.
// ПРОЦЕНТЫ ОКРУГЛЯЕМ ВНИЗ: 69 106/69 120 — это 99.9, а не «100 %» при
// четырнадцати непереведённых строках (правило «не врать цифрами», 2026-11-19).
const pct = (a, b) => (b ? Math.floor((a / b) * 1000) / 10 : null);
const P = (p) => p === null ? '—' : p + '%';
const W = (p) => (p === null ? 0 : p);
const up = (s) => s ? '<span class="ok">UP</span>' : '<span class="bad">down</span>';
// Размер: мелочь в МБ, иначе в ГБ (0.02 ГБ читать неудобно).
const size = (b) => !b ? '—' : b < 1073741824 ? Math.round(b / 1048576) + ' МБ' : (b / 1073741824).toFixed(2) + ' ГБ';
// Числа с пробелом-разделителем: 68357 -> 68 357.
const num = (n) => String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ' ');
// Любое неизвестное значение печатаем как «—», а не «undefined».
const N = (v) => (v === null || v === undefined ? '—' : num(v));
// Время в местной зоне: журналы пишут UTC, а человек сверяет с часами на столе
// (владелец 2026-11-18: «не понимаю что когда идёт» — на экране были UTC-срезы).
const hm = (v) => {
  const d = v instanceof Date ? v : new Date(v);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};
const hms = (v) => {
  const d = v instanceof Date ? v : new Date(v);
  return hm(d) + ':' + String(d.getSeconds()).padStart(2, '0');
};
// Мини-график: SVG без библиотек. Что важно для разбора сбоя (владелец 2026-11-17):
//   - ось ВРЕМЕНИ (x по timestamp, а не по индексу) — иначе «когда» не ответить;
//   - разрывы: если между замерами больше 2.5× медианного шага, линия рвётся
//     (иначе простой прогона выглядит как «данные были»);
//   - метки событий: остановка стражем и старт бэкенда (вертикальные риски);
//   - порог всегда в шкале (иначе пунктир 300 Вт не рисуется при максе 274);
//   - значение на правом краю + подписи времени под графиком;
//   - засечки оси времени: без них подпись окна не отвечает, в КАКОЙ момент был
//     скачок температуры или просадка скорости (владелец 2026-11-18).
// Ось времени общая для ВСЕХ графиков: одинаковый шаг и одинаковые подписи.
// Иначе «здоровье» и «скорость» рядом читаются как разные времена (2026-11-19).
const timeTicks = (t0, t1) => {
  const spanMin = (t1 - t0) / 60000;
  const tickMin = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720].find((m) => spanMin / m <= 5) || 1440;
  const stepMs = tickMin * 60000;
  const zoneMs = new Date(t0).getTimezoneOffset() * 60000;
  const out = [];
  for (let t = Math.ceil((t0 - zoneMs) / stepMs) * stepMs + zoneMs; t <= t1; t += stepMs) out.push(t);
  return out;
};
const tickGrid = (ticks, X, h) => ticks.map((t) =>
  '<line x1="' + X(t).toFixed(1) + '" y1="0" x2="' + X(t).toFixed(1) + '" y2="' + h +
  '" stroke="#2b3440" stroke-width="1" stroke-dasharray="2 4" vector-effect="non-scaling-stroke"/>').join('');
const tickAxis = (ticks, t0, t1) => ticks.length
  ? '<div class="axis">' + ticks.map((t) => {
    const p = ((t - t0) / Math.max(1, t1 - t0)) * 100;
    const anchor = p < 8 ? 'translateX(0)' : p > 92 ? 'translateX(-100%)' : 'translateX(-50%)';
    return '<span style="left:' + p.toFixed(1) + '%;transform:' + anchor + '">' + hm(t) + '</span>';
  }).join('') + '</div>'
  : '';
const spark = (points, color, label, unit, threshold, events, lastSuffix, mode) => {
  if (!points.length) return '';
  const w = 1000, h = 56, pad = 4;
  const ts = points.map((p) => Date.parse(p.t));
  const vs = points.map((p) => p.v);
  const t0 = ts[0], t1 = ts[ts.length - 1] || t0 + 1;
  const lo0 = Math.min.apply(null, vs), hi0 = Math.max.apply(null, vs);
  const span = hi0 - lo0 || Math.max(1, hi0 * 0.1);
  let lo = Math.max(0, lo0 - span * 0.15);
  let hi = hi0 + span * 0.15;
  // Порог всегда включается в диапазон шкалы: для RAM он был ниже видимого
  // (19…55 %), и пунктира не было видно вообще — читатель не понимал, далеко ли
  // он от аварии (владелец 2026-11-17: «а граница на 3 графике где?»).
  if (threshold !== undefined) {
    if (threshold < lo) lo = Math.max(0, threshold - span * 0.05);
    if (threshold > hi) hi = threshold + span * 0.05;
  }
  const X = (t) => ((t - t0) / Math.max(1, t1 - t0)) * w;
  const Y = (v) => h - pad - ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * (h - 2 * pad);
  // Медианный шаг — порог «разрыва».
  const steps = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
  const medStep = steps.length ? steps[Math.floor(steps.length / 2)] : 15000;
  const gapMs = Math.max(medStep * 2.5, 45000);
  const runs = [];
  let cur = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (ts[i] - ts[i - 1] > gapMs) { runs.push(cur); cur = []; }
    cur.push(points[i]);
  }
  runs.push(cur);
  // Режим step: значение сохраняется между изменениями, поэтому линия должна
  // тянуться до следующей точки (иначе при редких изменениях график пуст).
  const step = mode === 'step';
  const lines = step
    ? '<polyline fill="none" stroke="' + color + '" stroke-width="1.5" vector-effect="non-scaling-stroke" points="' +
      (() => {
        const pts = [];
        for (let i = 0; i < points.length; i++) {
          const x = X(Date.parse(points[i].t)).toFixed(1);
          const y = Y(points[i].v).toFixed(1);
          if (i > 0) pts.push(x + ',' + Y(points[i - 1].v).toFixed(1));
          pts.push(x + ',' + y);
        }
        const lastY = Y(points[points.length - 1].v).toFixed(1);
        pts.push(w + ',' + lastY);
        return pts.join(' ');
      })() + '" />'
    : runs.filter((r) => r.length > 1).map((r) =>
      '<polyline fill="none" stroke="' + color + '" stroke-width="1.5" vector-effect="non-scaling-stroke" points="' +
      r.map((p) => X(Date.parse(p.t)).toFixed(1) + ',' + Y(p.v).toFixed(1)).join(' ') + '" />').join('');
  const thrLine = threshold !== undefined && threshold >= lo && threshold <= hi
    ? '<line x1="0" y1="' + Y(threshold).toFixed(1) + '" x2="' + w + '" y2="' + Y(threshold).toFixed(1) +
      '" stroke="#8b98a5" stroke-width="1" stroke-dasharray="6 6" vector-effect="non-scaling-stroke"/>'
    : '';
  const evLines = (events || []).filter((e) => {
    const t = Date.parse(e.t);
    return t >= t0 && t <= t1;
  }).map((e) => {
    const col = e.kind === 'guard' ? '#f85149' : '#8b98a5';
    return '<line x1="' + X(Date.parse(e.t)).toFixed(1) + '" y1="0" x2="' + X(Date.parse(e.t)).toFixed(1) +
      '" y2="' + h + '" stroke="' + col + '" stroke-width="1" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>';
  }).join('');
  const last = points[points.length - 1];
  const ticks = timeTicks(t0, t1);
  const grid = tickGrid(ticks, X, h);
  const axis = tickAxis(ticks, t0, t1);
  return '<div class="sp"><svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:56px;display:block">' +
    grid + thrLine + evLines + lines + '</svg>' + axis +
    '<div class="muted" style="font-size:11px;display:flex;justify-content:space-between;gap:8px">' +
    '<span class="lbl">' + label + ' <b style="color:#e6edf3">' + last.v.toFixed(0) + ' ' + unit + (lastSuffix || '') +
    '</b> <span class="muted">' + hm(last.t) + '</span></span>' +
    '<span class="lbl">' + (lo0 === hi0 ? lo0.toFixed(0) : lo0.toFixed(0) + '…' + hi0.toFixed(0)) + ' ' + unit +
    (threshold !== undefined ? ' · порог ' + threshold : '') + '</span></div></div>';
};

/**
 * Скорость перевода: СКОЛЬКО СТРОК переведено за интервал. Считаем по
 * корзинам (1–10 мин), но рисуем линией скользящего среднего по трём корзинам:
 * отдельные замеры «пилят», а столбики выглядели грубо (владелец: «убери
 * страшные столбики», 2026-11-19). Окно — до часа, как у здоровья: оси
 * совпадают, и просадка видна на обеих картинках в одном месте.
 */
const bars = (points, color, rate) => {
  if (!points || points.length < 2) return '<div class="muted" style="font-size:12px">нет данных — очередь не идёт</div>';
  const w = 1000, h = 64, pad = 3;
  const t1 = Date.parse(points[points.length - 1].t);
  // Окно — не больше часа и не шире того, что реально накоплено: иначе первые
  // полчаса после старта пульта график пустой справа и врёт «за час».
  const first = Date.parse(points[0].t);
  let t0 = Math.max(first, t1 - 60 * 60_000);
  // Минимум 10 минут окна: на двух минутах столбики получаются по пол-экрана и
  // график выглядит сплошным блоком (сразу после старта пульта).
  if (t1 - t0 < 10 * 60_000) t0 = t1 - 10 * 60_000;
  const spanMin = Math.max(1, (t1 - t0) / 60_000);
  // Шаг столбика — чтобы их было 10-20: час → 5 мин, десять минут → минута.
  const bucketMin = [1, 2, 5, 10].find((m) => spanMin / m <= 20) || 10;
  const BUCKET = bucketMin * 60_000;
  const n = Math.max(1, Math.round((t1 - t0) / BUCKET));
  const vals = [];
  for (let i = 0; i < n; i++) vals.push(0);
  for (let i = 1; i < points.length; i++) {
    const t = Date.parse(points[i].t);
    if (t < t0) continue;
    const d = points[i].v - points[i - 1].v;
    if (d <= 0) continue;
    const b = Math.min(n - 1, Math.floor((t - t0) / BUCKET));
    vals[b] += d;
  }
  const peak = Math.max(1, Math.max.apply(null, vals));
  const X = (t) => ((t - t0) / (t1 - t0)) * w;
  const Y = (v) => h - pad - (v / peak) * (h - 2 * pad);
  const bw = w / n;
  const avg = vals.map((_, i) => {
    const win = [vals[i - 1], vals[i], vals[i + 1]].filter((x) => x !== undefined);
    return win.reduce((a, b) => a + b, 0) / win.length;
  });
  const line = '<polyline fill="none" stroke="' + color + '" stroke-width="1.6" vector-effect="non-scaling-stroke" points="' +
    avg.map((v, i) => ((i + 0.5) * bw).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ') + '" />';
  // Горизонтальные отметки по значениям: без них линию не с чем сверить
  // (владелец 2026-11-19). Подписи — HTML-слоем: внутри SVG с
  // preserveAspectRatio="none" текст растягивается по ширине.
  const yLevels = [];
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, peak / 2))));
  const stepV = Math.max(1, (peak / 2 <= mag ? 1 : peak / 2 <= 2 * mag ? 2 : 5) * mag);
  for (let v = stepV; v <= peak; v += stepV) yLevels.push(v);
  const hMarks = yLevels.map((v) =>
    '<line x1="0" y1="' + Y(v).toFixed(1) + '" x2="' + w + '" y2="' + Y(v).toFixed(1) +
    '" stroke="#2b3440" stroke-width="1" stroke-dasharray="2 6" vector-effect="non-scaling-stroke"/>').join('');
  const yLabels = yLevels.map((v) =>
    '<span style="top:' + ((Y(v) / h) * 100).toFixed(1) + '%">' + v + '</span>').join('');
  const ticks = timeTicks(t0, t1);
  const grid = tickGrid(ticks, X, h);
  const axis = tickAxis(ticks, t0, t1);
  const total = vals.reduce((a, b) => a + b, 0);
  const perMin = Math.round(total / spanMin);
  // Подпись на две коротких части: карточка узкая (c5-ряд), длинный текст
  // налезал сам на себя (2026-11-19).
  return '<div class="sp" style="position:relative"><svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:56px;display:block">' +
    grid + hMarks + line + '</svg>' + '<div class="yaxis">' + yLabels + '</div>' + axis +
    '<div class="muted" style="font-size:11px;display:flex;justify-content:space-between;gap:8px">' +
    '<span class="lbl"><b style="color:#e6edf3">' + (rate === null ? '…' : rate) + '</b> стр/мин</span>' +
    '<span class="lbl" title="столбик ' + bucketMin + ' мин · в среднем ' + perMin + '/мин · пик ' + peak +
    ' за ' + bucketMin + ' мин · ' + hm(t1) + '">' + num(total) + ' строк / ' + Math.round(spanMin) + ' мин</span></div></div>';
};
async function tick() {
  let s;
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    s = await r.json();
  } catch (e) {
    // Пульт перезапускают/уронили: честно пишем «нет связи», а не замираем молча.
    $('at').innerHTML = '<span class="bad">нет связи</span>';
    return;
  }
  // Старая вкладка + новый API = «undefined» на новых полях: перезагружаемся.
  // Метка привязана к ВЕРСИИ, иначе авто-reload срабатывает один раз за сессию
  // и на следующем изменении полей страница снова показывает «undefined».
  const seen = sessionStorage.getItem('dashReload');
  if (s.v !== ${API_VER} && seen !== String(${API_VER})) {
    sessionStorage.setItem('dashReload', String(${API_VER}));
    location.reload();
    return;
  }
  $('at').textContent = hms(s.at);
  // Заголовок вкладки = язык и процент: прогресс видно из панели задач, не открывая пульт.
  document.title = s.live
    ? (s.queue ? s.queue.lang + ' ' + P(pct(s.live.filled, s.live.total)) + ' · TSSR' : 'TSSR · пульт')
    : 'TSSR · пульт';
  // Полоса состояния: сначала проблемы, потом «всё в норме».
  const alerts = [];
  if (!s.servers.translate.up) alerts.push(['bad', 'бэкенд перевода (:8081) не отвечает — перевод стоит']);
  if (!s.queue) alerts.push(['warn', 'очередь переводов не запущена']);
  else {
    const qAgeMin = (Date.now() - Date.parse(s.queue.at)) / 60_000;
    // Только ИЗМЕРЕННЫЙ ноль: rate === null — это «сэмпла ещё нет» (пульт
    // только что перезапущен), и предупреждение «молчит» было ложным
    // (поймано 2026-11-19 сразу после рестарта при живом прогоне).
    const stalled = s.live && s.live.rate === 0 && qAgeMin > 12;
    if (stalled) alerts.push(['warn', 'очередь молчит ' + Math.round(qAgeMin) + ' мин (пасс идёт, но прогресса нет)']);
  }
  const lastH = s.health && s.health.samples.length ? s.health.samples.at(-1) : null;
  const lastStop = s.health && s.health.lastStop ? Date.parse(s.health.lastStop.t) : 0;
  if (lastStop && Date.now() - lastStop < 30 * 60_000) alerts.push(['warn', 'страж останавливал прогон недавно: ' + s.health.lastStop.note]);
  if (lastH && lastH.ramFreePct <= 10) alerts.push(['warn', 'мало RAM: свободно ' + lastH.ramFreePct + ' %']);
  if (lastH && lastH.gpuTemp >= 80) alerts.push(['bad', 'GPU горячий: ' + lastH.gpuTemp + ' °C']);
  if (!alerts.length) alerts.push(['ok', 'всё в норме']);
  $('alerts').innerHTML = alerts.map((a) => '<div class="al ' + a[0] + '">' + a[1] + '</div>').join('');
  const sv = s.servers;
  $('tr').innerHTML =
    '<div class="row"><span>llama-server :8081</span><span>' + up(sv.translate.up) + '</span></div>' +
    '<div class="row"><span>модель</span><span class="v">' + (sv.translate.model || '—') + '</span></div>' +
    '<div class="row"><span>LM Studio :1234</span><span>' + (sv.lmstudio.up ? up(1) : '<span class="muted">не используется</span>') + '</span></div>' +
    '<div class="row"><span>Strata :8080</span><span>' + (sv.strata.up ? up(1) : '<span class="muted">не используется</span>') + '</span></div>' +
    '<div class="row"><span title="рабочий набор включает mmap модели и буферы CUDA">llama-server RAM (с mmap)</span><span class="v">' + size(s.proc.llamaMB * 1048576) + '</span></div>';
  const g = s.gpu;
  $('sys').innerHTML =
    (g ? '<div class="row"><span>GPU</span><span class="v big">' + g.util + '%</span></div>' +
      '<div class="bar"><i style="width:' + g.util + '%;background:#4c8bd6"></i></div>' +
      '<div class="row"><span>видеопамять</span><span class="v">' + (g.usedMiB/1024).toFixed(1) + ' / ' + (g.totalMiB/1024).toFixed(1) + ' ГБ</span></div>' +
      '<div class="row"><span>температура</span><span class="v">' + g.tempC + ' °C</span></div>' : '<div class="muted">nvidia-smi недоступен</div>') +
    '<div class="row"><span>CPU</span><span class="v">' + s.system.cpu + '%</span></div>' +
    '<div class="row"><span>RAM</span><span class="v">' + (s.system.memUsed/1024).toFixed(1) + ' / ' + (s.system.memTotal/1024).toFixed(1) + ' ГБ</span></div>';
  const hl = s.health || { samples: [], stops: 0, lastStop: null, events: [] };
  const smp = hl.samples || [];
  const ev = hl.events || [];
  const lastS = smp.length ? smp[smp.length - 1] : null;
  // Считаем остановки ТОЛЬКО в видимом окне и с причиной: иначе в заголовке
  // висели старые срабатывания (например, до фикса порогов) и читалось как
  // «оно опять остановилось» (владелец 2026-11-17).
  const winFrom = smp.length ? Date.parse(smp[0].t) : 0;
  const guardInWin = ev.filter((e) => e.kind === 'guard' && Date.parse(e.t) >= winFrom);
  const lastGuard = guardInWin.length ? guardInWin[guardInWin.length - 1] : null;
  // Точки с временем: график строит ось по timestamp, а не по индексу.
  const pts = (key) => smp.map((x) => ({ t: x.t, v: x[key] }));
  // Слоты -np приводятся к окну здоровья: иначе соседние графики жили в разных
  // шкалах (слоты — с утра, здоровье — час) и «когда было 8» не сопоставлялось.
  const npPts = (() => {
    const all = (s.np && s.np.points) || [];
    if (!all.length || !smp.length) return [];
    const from = Date.parse(smp[0].t);
    const before = all.filter((p) => Date.parse(p.t) <= from);
    const after = all.filter((p) => Date.parse(p.t) > from);
    // Последнее известное значение «растягивается» на начало окна (режим step):
    // иначе график слотов уходил в прошлое и жил в другой шкале времени.
    const out = (before.length ? [{ t: smp[0].t, v: before[before.length - 1].v }] : []).concat(after);
    // ...и на конец окна: без этого ось кончалась на последней смене -np
    // (20:34 против 20:44 у остальных) и метки не совпадали по колонкам.
    const end = smp[smp.length - 1].t;
    if (out.length && Date.parse(out[out.length - 1].t) < Date.parse(end)) {
      out.push({ t: end, v: out[out.length - 1].v });
    }
    return out;
  })();
  // Каждый график — в своей карточке; в подписи значения — «сейчас» и время.
  const noData = '<div class="muted" style="font-size:12px">данных нет</div>';
  $('h1').innerHTML = smp.length ? spark(pts('gpuPower'), '#d29922', 'сейчас', 'Вт', 300, ev) : noData;
  $('h2').innerHTML = smp.length ? spark(pts('gpuTemp'), '#f85149', 'сейчас', '°C', 85, ev) : noData;
  $('h3').innerHTML = smp.length
    ? spark(smp.map((x) => ({ t: x.t, v: 100 - x.ramFreePct })), '#3fb950', 'сейчас', '%', 96, ev,
        ' (' + (s.system.memTotal / 1024 - (lastS.ramFreeGb ?? 0)).toFixed(1) + ' ГБ)')
    : noData;
  // Слоты -np — четвёртая карточка: режим меняется редко, в общей полосе он
  // только мешал (2026-11-19).
  $('npchart').innerHTML = npPts.length
    ? spark(npPts, '#4c8bd6', 'сейчас', 'шт', undefined, [], '', 'step')
    : '<div class="muted" style="font-size:12px">истории нет — сторож слотов не запущен</div>';
  // Одна общая подпись окна и легенда меток на всю строку: повторять «08:40 →
  // 09:51» под каждым графиком — шум (владелец 2026-11-17).
  $('htime').textContent = smp.length
    ? 'окно ' + hm(smp[0].t) + ' → ' + hm(smp[smp.length - 1].t) + ' (местное время) · ' +
      smp.length + ' замеров · страж в окне: ' + guardInWin.length +
      (lastGuard && lastGuard.note ? ' (' + lastGuard.note.replace(/_/g, ' ').toLowerCase() + ')' : '') +
      ' · всего за лог: ' + hl.stops +
      ' · пунктир — порог · серая риска — старт бэкенда · красная — остановка стражем · разрыв линии — замеров не было'
    : 'данных нет (страж не запущен)';
  const q = s.queue;
  const lp = s.live ? pct(s.live.filled, s.live.total) : null;
  const etaAbs = s.live && s.live.etaMin ? new Date(Date.now() + s.live.etaMin * 60_000) : null;
  const etaTxt = s.live && s.live.etaMin
    ? Math.floor(s.live.etaMin / 60) + ' ч ' + (s.live.etaMin % 60) + ' мин' +
      (etaAbs ? ' (≈ ' + String(etaAbs.getHours()).padStart(2, '0') + ':' + String(etaAbs.getMinutes()).padStart(2, '0') + ')' : '')
    : '—';
  $('queue').innerHTML = q
    ? '<div class="row"><span>текущий язык</span><span class="v big">' + q.lang +
        (s.live ? ' · ' + P(lp) : '') + '</span></div>' +
      (s.live
        ? '<div class="bar"><i style="width:' + W(lp) + '%"></i></div>' +
          '<div class="row"><span>готово</span><span class="v">' + N(s.live.filled) + ' / ' + N(s.live.total) + '</span></div>' +
          '<div class="row"><span>скорость</span><span class="v">' + (s.live.rate === null ? '…' : s.live.rate + ' стр/мин') + '</span></div>' +
          '<div class="row"><span>осталось</span><span class="v">' + etaTxt + '</span></div>'
        : '') +
      '<div class="row"><span>пасс стартовал</span><span class="muted">' + hms(q.at) + '</span></div>'
    : '<div class="muted">очередь не запущена</div>';
  // Скорость — отдельной карточкой: там объём по интервалам, а не мгновенная
  // цифра. В карточке очереди график только отнимал место (2026-11-19).
  $('speed').innerHTML = bars(s.progress || [], '#4c8bd6', s.live ? s.live.rate : null);
  $('tail').textContent = (s.tail || []).join('\\n') || '—';
  const vr = s.voiceRun;
  $('vrun').innerHTML = vr && vr.running
    ? '<span class="ok">озвучка идёт</span> · ' + (vr.lang || '?') +
      (vr.total ? ' · ' + N(vr.done) + ' / ' + N(vr.total) : ' · ' + N(vr.done) + ' файлов') +
      (vr.perMin ? ' · ' + vr.perMin + ' файлов/мин' : '') +
      (vr.etaMin !== null && vr.etaMin !== undefined ? ' · ETA ' + vr.etaMin + ' мин' : '') +
      ' · воркеров ' + vr.workers +
      (vr.current ? '<br>сейчас: ' + vr.current.replace(/&/g, '&amp;').replace(/</g, '&lt;') : '')
    : (vr ? '<span class="muted">озвучка: не идёт · воркеров ' + vr.workers + '</span>' : '<span class="muted">озвучка: не идёт</span>');
  const v = s.voice;
  if (!v) {
    // Корпус озвучки считается в фоне (~9 с на холодную) — не подвешиваем страницу.
    $('lingua').innerHTML = '<div class="muted">загрузка… (обход корпуса озвучки)</div>';
    $('vhealth').innerHTML = '';
    $('arcs').innerHTML = '';
    return;
  }
  const color = (p) => p === null ? 'var(--line)' : p >= 100 ? 'var(--ok)' : p > 3 ? 'var(--warn)' : 'var(--bad)';
  // Кольцо вместо полосы: числа строк не нужны для визуала, проценты — нужны
  // (владелец 2026-11-17: «UI оценивать по пользе»). Точные значения — в title.
  const ring = (p, col) => {
    const C = 94.25; // 2πr при r=15
    const v = p === null ? 0 : Math.max(0, Math.min(100, p));
    return '<svg class="ring" viewBox="0 0 36 36" width="26" height="26">' +
      '<circle cx="18" cy="18" r="15" fill="none" stroke="#252c33" stroke-width="4"/>' +
      (v > 0 ? '<circle cx="18" cy="18" r="15" fill="none" stroke="' + col + '" stroke-width="4" stroke-linecap="round" ' +
        'stroke-dasharray="' + (C * v / 100).toFixed(1) + ' ' + C + '" transform="rotate(-90 18 18)"/>' : '') +
      '<text x="18" y="21.5" text-anchor="middle" font-size="9.5" fill="#e6edf3">' + (p === null ? '—' : Math.round(v)) + '</text></svg>';
  };
  const byLang = new Map(v.langs.map((l) => [l.lang, l]));
  // Одна строка на язык: код + два кольца (текст, озвучка) + короткая справка.
  // Порядок — приоритет языков из config/language-priority.json (сортировку по
  // прогрессу убрали: ревьюить удобнее в приоритете, 2026-11-19).
  const langsOrdered = s.languages;
  $('lingua').innerHTML = langsOrdered.map((t) => {
    const o = byLang.get(t.lang) || { done: 0, plan: 0, arcsDone: 0, arcsTotal: 0, bytes: 0 };
    const po = t.po || {};
    const tp = pct(po.filled, po.total);
    const vp = pct(o.done, o.plan);
    return '<div class="ling"><b>' + t.lang + '</b>' +
      ring(tp, color(tp)) + ring(vp, color(vp)) +
      '<span class="muted" style="font-size:11px" title="перевод ' + N(po.filled) + ' / ' + N(po.total) +
      ' · озвучено ' + N(o.done) + ' / ' + N(o.plan) + ' переведённых · файлы ' + size(o.bytes) + '">' +
      'арки ' + (o.arcsDone || 0) + '/' + (o.arcsTotal || 0) + '</span></div>';
  }).join('');
  const active = v.workers > 0 ? Object.entries(v.active).filter(([, a]) => a && a !== '?') : [];
  const bytes = v.langs.reduce((a, l) => a + (l.bytes || 0), 0);
  const bad = v.orphans || v.parts;
  // Одной строкой: три полнострочных ряда «подпись … значение» давали
  // полосу пустоты в середине (владелец: «что за гап?», 2026-11-16).
  $('vhealth').innerHTML = '<div class="stats muted">' +
    'корпус ' + size(bytes) +
    ' · шимы-воркеры <span class="' + (v.workers > 0 ? 'ok' : '') + '">' + (v.workers < 0 ? '—' : v.workers) + '</span>' +
    ' · сироты loudnorm / .part <span class="' + (bad ? 'warn' : '') + '">' + v.orphans + ' / ' + v.parts + '</span>' +
    (active.length ? ' · в работе: ' + active.map(([l, a]) => l + ' → ' + a).join(', ') : '') +
    '</div>';
  // 19 строк арок — шум: показываем только те, что УЖЕ начаты, и счётчики
  // остальных. Сортировка по прогрессу: «что ближе к закрытию» — первое.
  const fullArcs = v.arcs.filter((a) => a.total > 0 && a.closed === a.total).length;
  const partialArcs = v.arcs.filter((a) => !(a.total > 0 && a.closed === a.total));
  const started = partialArcs
    .filter((a) => a.closed > 0)
    .toSorted((a, b) => b.closed - a.closed || a.arc.localeCompare(b.arc));
  const notStarted = partialArcs.length - started.length;
  $('arcs').innerHTML = '<div class="stats muted">арки: <span class="' +
    (fullArcs === v.arcs.length ? 'ok' : '') + '">' + fullArcs + ' / ' + v.arcs.length + '</span> закрыты полностью' +
    (started.length ? ' · в работе: ' + started.slice(0, 6).map((a) => a.arc + ' ' + a.closed + '/' + a.total).join(' · ') : '') +
    (started.length > 6 ? ' · +' + (started.length - 6) + ' ещё' : '') +
    (notStarted ? ' · не начаты: ' + notStarted : '') + '</div>';
}
tick(); setInterval(tick, 3000);
</script></body></html>`;

/**
 * Сервер стартует ТОЛЬКО при прямом запуске файла: иначе импорт (например,
 * из теста ради `arcsClosed`) молча занимал бы порт 8087.
 */
export const start = (): void => {
  // Прогреваем дорогие блоки сразу, дольками (не блокируя ответы):
  //  - счётчики po (10 файлов × 15 МБ, ~0.2 с на файл) — иначе первый запрос
  //    после старта платит за все 10 (~2 с);
  //  - корпус озвучки (~9 с холодным, считается по языкам).
  void (async (): Promise<void> => {
    for (const lang of LANGS) {
      try {
        poStats(lang);
      } catch {
        /* нет файла — не беда */
      }
      await yieldTick();
    }
  })();
  void computeVoice();
  sampleTick();
  setInterval(sampleTick, 15_000).unref();
  createServer((req, res) => {
    if (req.url?.startsWith("/api/state")) {
      void state().then((s) => {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify(s));
      });
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PAGE);
  }).listen(PORT, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${PORT}`;
    console.log(`пульт: ${url}`);
    if (process.argv.includes("--open")) {
      const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
      spawn(cmd[0] as string, cmd[1] as string[], { detached: true, stdio: "ignore" }).unref();
    }
  });
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
