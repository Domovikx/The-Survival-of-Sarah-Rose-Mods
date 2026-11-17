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
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
const LANGS = ["zh", "ru", "es", "pt", "de", "ja", "fr", "pl", "ko", "it"];
/**
 * Версия формата /api/state. Страница, открытая до перезапуска пульта, иначе
 * живёт со старым JS и рисует «undefined» на новых полях (поймано 2026-11-16).
 * Поднимать при ЛЮБОМ изменении набора полей.
 */
const API_VER = 12;

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

const gpu = (): GpuInfo | null => {
  // nvidia-smi дёргаем не чаще раза в 3 с: страница не должна сама есть ресурсы.
  if (Date.now() - gpuCache.at < 3000) return gpuCache.value;
  const out = shell("nvidia-smi", [
    "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
    "--format=csv,noheader,nounits",
  ]);
  const parts = out
    .split(/\r?\n/)[0]
    ?.split(",")
    .map((x) => Number(x.trim()));
  if (!parts || parts.length < 4 || parts.some(Number.isNaN)) return null;
  return { util: parts[0]!, usedMiB: parts[1]!, totalMiB: parts[2]!, tempC: parts[3]! };
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
  const file = join(PO_DIR, `${lang}.po`);
  const cached = poCache.get(lang);
  const mtime = existsSync(file) ? statSync(file).mtimeMs : 0;
  // Наружу отдаём только {filled,total} — служебный `at` клиенту не нужен.
  const plain = (): PoStat | null => (cached ? { filled: cached.filled, total: cached.total } : null);
  if (cached && Date.now() - cached.at < 60_000 && cached.at >= mtime) return plain();
  if (!poBusy.has(lang)) {
    poBusy.add(lang);
    setImmediate(() => {
      try {
        const fresh = refreshPo(lang);
        if (fresh) poCache.set(lang, { at: Date.now(), ...fresh });
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

const logTail = (lang: string, lines = 2): string[] => {
  const file = join("tmp", `translate_${lang}.run.log`);
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf-8");
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("  "))
    .slice(-lines);
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
  value: { samples: [] as HealthSample[], stops: 0, lastStop: null as { t: string; note: string } | null },
};
interface HealthSample {
  t: string;
  gpuTemp: number;
  gpuPower: number;
  gpuUtil: number;
  ramFreePct: number;
  cpu: number;
}
const health = (): { samples: HealthSample[]; stops: number; lastStop: { t: string; note: string } | null } => {
  const file = join("tmp", "health.csv");
  if (!existsSync(file)) return { samples: [], stops: 0, lastStop: null };
  const mtime = statSync(file).mtimeMs;
  if (mtime === healthCache.mtime && Date.now() - healthCache.at < 30_000) return healthCache.value;
  const lines = readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean);
  const samples: HealthSample[] = [];
  let stops = 0;
  let lastStop: { t: string; note: string } | null = null;
  let prevNote = "";
  for (const line of lines.slice(-400)) {
    const c = line.split(",");
    if (c[1] === "GUARD") {
      stops++;
      // Причина остановки — в примечании предыдущего замера (RAM_МАЛО / GPU_ЖАР…).
      lastStop = { t: c[0] ?? "", note: prevNote || "порог" };
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
      cpu: Number(c[6]),
    });
  }
  const value = { samples: samples.slice(-240), stops, lastStop };
  healthCache.at = Date.now();
  healthCache.mtime = mtime;
  healthCache.value = value;
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

/** Скорость и ETA: сэмпл прогресса текущего языка раз в ~30 с. */
let sample: { lang: string; filled: number; at: number } | null = null;
/**
 * Последняя посчитанная скорость. Без кэша число живёт ОДИН запрос (тот, что
 * перешагнул окно 30 с), а остальные 14 из 15 опросов снова показывали «…» —
 * скорость мигала (поймано глазами 2026-11-16).
 */
let rateCache: { lang: string; perMin: number; at: number } | null = null;

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
  if (voiceCache && Date.now() - voiceCache.at < 60_000) return voiceCache.value;
  void computeVoice();
  return null;
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

  const live = current ? poStats(current) : null;
  // Скорость считаем раз в ~30 с, но ОТДАЁМ последнее известное значение, пока
  // оно относится к тому же языку: иначе цифра мигает «…» на каждом опросе.
  if (live && current) {
    if (!sample || sample.lang !== current) {
      sample = { lang: current, filled: live.filled, at: Date.now() };
    } else if (Date.now() - sample.at > 30_000) {
      const perMin = ((live.filled - sample.filled) / (Date.now() - sample.at)) * 60_000;
      rateCache = { lang: current, perMin, at: Date.now() };
      sample = { lang: current, filled: live.filled, at: Date.now() };
    }
  }
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
    tail: current ? logTail(current) : [],
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
  .card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:10px 12px; }
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
  .v { color:#fff; }
  .ok { color:var(--ok); } .bad { color:var(--bad); } .warn { color:var(--warn); } .muted { color:var(--muted); }
  .bar { height:6px; background:#0c0f12; border-radius:3px; overflow:hidden; margin:4px 0 8px; }
  .bar > i { display:block; height:100%; background:var(--ok); }
  .tail { white-space:pre-wrap; color:var(--muted); font-size:12px; }
  .big { font-size:22px; }
  .arcs { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:2px 18px; margin-top:10px; }
  /* minmax(0,1fr) + overflow:hidden обязательны: иначе длинное имя арки
     распирает ячейку и счётчик соседа наезжает на текст (поймано 2026-11-16
     на широком окне: «Other 6/11 яз.» наложилось на «PrisonArc»). */
  .arc { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:baseline; font-size:12px; min-width:0; overflow:hidden; }
  .arc > span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .arc > span:last-child { text-align:right; }
  .lingua { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:0 26px; }
  .ling { display:grid; grid-template-columns:40px 30px 30px minmax(0,1fr); gap:10px; align-items:center; padding:3px 0; }
  .ling > span:last-child { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ring { display:block; }
  .hint { font-size:11px; margin:2px 0 10px; }
  /* Три графика в ряд: полоса на всю ширину давала «простыню» и вертикальный гап. */
  #hchart { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:6px 18px; }
  #hchart > .sp { min-width:0; }
  .stats { margin-top:12px; font-size:12px; }
</style></head><body>
<h1>TSSR · локальный пульт <span id="at" class="muted"></span></h1>
<div class="grid">
  <div class="card c5"><h2>Очередь</h2><div id="queue"><span class="muted">загрузка…</span></div></div>
  <div class="card c3"><h2>Бэкенд перевода</h2><div id="tr"><span class="muted">загрузка…</span></div></div>
  <div class="card c4"><h2>GPU / CPU / RAM</h2><div id="sys"><span class="muted">загрузка…</span></div></div>
  <div class="card c12"><h2>Здоровье ПК · health.csv <span class="muted" id="hnote"></span></h2>
    <div id="hnow"></div>
    <div id="hchart"></div>
  </div>
  <div class="card c8"><h2>Языки: текст и озвучка</h2>
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
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const P = (p) => p === null ? '—' : p + '%';
const W = (p) => (p === null ? 0 : p);
const up = (s) => s ? '<span class="ok">UP</span>' : '<span class="bad">down</span>';
// Размер: мелочь в МБ, иначе в ГБ (0.02 ГБ читать неудобно).
const size = (b) => !b ? '—' : b < 1073741824 ? Math.round(b / 1048576) + ' МБ' : (b / 1073741824).toFixed(2) + ' ГБ';
// Числа с пробелом-разделителем: 68357 -> 68 357.
const num = (n) => String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ' ');
// Любое неизвестное значение печатаем как «—», а не «undefined».
const N = (v) => (v === null || v === undefined ? '—' : num(v));
// Мини-график: SVG-полилиния без библиотек. Шкала ДИНАМИЧЕСКАЯ (min..max с
// запасом 10 %): при фиксированном 0..100 линия температуры 30–73 °C жалась к
// низу и ничего не показывала (владелец 2026-11-17: «UI по пользе»).
// threshold — горизонтальная пунктирная линия (порог стража), если попадает в шкалу.
const spark = (vals, color, label, unit, threshold) => {
  if (!vals.length) return '';
  const w = 1000, h = 56, pad = 4;
  const lo0 = Math.min.apply(null, vals);
  const hi0 = Math.max.apply(null, vals);
  const span = hi0 - lo0 || Math.max(1, hi0 * 0.1);
  const lo = Math.max(0, lo0 - span * 0.15);
  const hi = hi0 + span * 0.15;
  const y = (v) => h - pad - ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * (h - 2 * pad);
  const pts = vals.map((v, i) => {
    const x = vals.length === 1 ? 0 : (i / (vals.length - 1)) * w;
    return x.toFixed(1) + ',' + y(v).toFixed(1);
  }).join(' ');
  const t = threshold !== undefined && threshold > lo && threshold < hi
    ? '<line x1="0" y1="' + y(threshold).toFixed(1) + '" x2="' + w + '" y2="' + y(threshold).toFixed(1) +
      '" stroke="#8b98a5" stroke-width="1" stroke-dasharray="6 6" vector-effect="non-scaling-stroke"/>'
    : '';
  return '<div class="sp"><svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:56px;display:block">' +
    t + '<polyline fill="none" stroke="' + color + '" stroke-width="1.5" vector-effect="non-scaling-stroke" points="' + pts + '" /></svg>' +
    '<div class="muted" style="font-size:11px;display:flex;justify-content:space-between;gap:8px">' +
    '<span>' + label + '</span><span>' + lo0.toFixed(0) + '…' + hi0.toFixed(0) + ' ' + unit +
    (threshold !== undefined ? ' · порог ' + threshold : '') + '</span></div></div>';
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
  $('at').textContent = s.at.slice(11, 19);
  const sv = s.servers;
  $('tr').innerHTML =
    '<div class="row"><span>llama-server :8081</span><span>' + up(sv.translate.up) + '</span></div>' +
    '<div class="row"><span>модель</span><span class="v">' + (sv.translate.model || '—') + '</span></div>' +
    '<div class="row"><span>LM Studio :1234</span><span>' + up(sv.lmstudio.up) + '</span></div>' +
    '<div class="row"><span>Strata :8080</span><span>' + up(sv.strata.up) + '</span></div>' +
    '<div class="row"><span title="рабочий набор включает mmap модели и буферы CUDA">llama-server RAM (с mmap)</span><span class="v">' + s.proc.llamaMB + ' МБ</span></div>';
  const g = s.gpu;
  $('sys').innerHTML =
    (g ? '<div class="row"><span>GPU</span><span class="v big">' + g.util + '%</span></div>' +
      '<div class="bar"><i style="width:' + g.util + '%"></i></div>' +
      '<div class="row"><span>видеопамять</span><span class="v">' + (g.usedMiB/1024).toFixed(1) + ' / ' + (g.totalMiB/1024).toFixed(1) + ' ГБ</span></div>' +
      '<div class="row"><span>температура</span><span class="v">' + g.tempC + ' °C</span></div>' : '<div class="muted">nvidia-smi недоступен</div>') +
    '<div class="row"><span>CPU</span><span class="v">' + s.system.cpu + '%</span></div>' +
    '<div class="row"><span>RAM</span><span class="v">' + (s.system.memUsed/1024).toFixed(1) + ' / ' + (s.system.memTotal/1024).toFixed(1) + ' ГБ</span></div>';
  const hl = s.health || { samples: [], stops: 0 };
  const smp = hl.samples || [];
  const lastS = smp.length ? smp[smp.length - 1] : null;
  $('hnote').textContent = smp.length
    ? '· ' + smp.length + ' замеров · остановок стражем: ' + hl.stops + (hl.lastStop ? ' (последняя: ' + hl.lastStop.note + ')' : '')
    : '· данных нет (страж не запущен)';
  $('hnow').innerHTML = lastS
    ? '<div class="row"><span>сейчас</span><span class="v">GPU ' + lastS.gpuTemp + ' °C · ' +
      Math.round(lastS.gpuPower) + ' Вт · ' + lastS.gpuUtil + '% · кэш ' + lastS.ramFreePct + '% RAM</span></div>'
    : '';
  $('hchart').innerHTML = smp.length
    ? spark(smp.map((x) => x.gpuPower), '#d29922', 'GPU мощность', 'Вт', 300) +
      spark(smp.map((x) => x.gpuTemp), '#f85149', 'GPU температура', '°C', 85) +
      spark(smp.map((x) => x.ramFreePct), '#3fb950', 'RAM свободно', '%', 6)
    : '';
  const q = s.queue;
  const lp = s.live ? pct(s.live.filled, s.live.total) : null;
  $('queue').innerHTML = q
    ? '<div class="row"><span>текущий язык</span><span class="v">' + q.lang + '</span></div>' +
      (s.live ? '<div class="row"><span>готово</span><span class="v">' + N(s.live.filled) + ' / ' + N(s.live.total) + '</span></div>' +
        '<div class="bar"><i style="width:' + W(lp) + '%"></i></div>' +
        '<div class="row"><span>процент</span><span class="v">' + P(lp) + '</span></div>' +
        '<div class="row"><span>скорость</span><span class="v">' + (s.live.rate === null ? '…' : s.live.rate + ' стр/мин') + '</span></div>' +
        '<div class="row"><span>ETA</span><span class="v">' + (s.live.etaMin ? Math.floor(s.live.etaMin / 60) + ' ч ' + (s.live.etaMin % 60) + ' мин' : '—') + '</span></div>' : '') +
      '<div class="row"><span>пасс стартовал</span><span class="muted">' + String(q.at).slice(11, 19) + '</span></div>'
    : '<div class="muted">очередь не запущена</div>';
  $('tail').textContent = (s.tail || []).join('\\n') || '—';
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
  $('lingua').innerHTML = s.languages.map((t) => {
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
tick(); setInterval(tick, 2000);
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
