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

const PORT = Number(process.argv[process.argv.indexOf("--port") + 1]) || 8087;
const PO_DIR = join("patches", "ai-voice-pack", "po");
const LANGS = ["zh", "ru", "es", "pt", "de", "ja", "fr", "pl", "ko", "it"];

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

/** Кэш счётчиков po: чтение 10 файлов по 15 МБ на каждый тик — лишнее. */
const poCache = new Map<string, { at: number; filled: number; total: number }>();
const poStats = (lang: string): { filled: number; total: number } => {
  const file = join(PO_DIR, `${lang}.po`);
  const cached = poCache.get(lang);
  const mtime = existsSync(file) ? statSync(file).mtimeMs : 0;
  if (cached && Date.now() - cached.at < 60_000 && cached.at >= mtime) return cached;
  const text = readFileSync(file, "utf-8");
  const total = (text.match(/^msgid /gm) ?? []).length - 1;
  const filled = (text.match(/^msgstr "..+/gm) ?? []).length;
  const value = { filled, total };
  poCache.set(lang, { at: Date.now(), ...value });
  return value;
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
  let rate = 0;
  if (live && current) {
    if (!sample || sample.lang !== current) sample = { lang: current, filled: live.filled, at: Date.now() };
    else if (Date.now() - sample.at > 30_000) {
      rate = ((live.filled - sample.filled) / (Date.now() - sample.at)) * 60_000;
      sample = { lang: current, filled: live.filled, at: Date.now() };
    }
  }

  return {
    at: new Date().toISOString(),
    live: live
      ? { ...live, rate: Math.round(rate), etaMin: rate > 0 ? Math.round((live.total - live.filled) / rate) : null }
      : null,
    system: { cpu, memUsed, memTotal, memPeak },
    gpu: gpu(),
    proc: processRam(),
    servers: {
      translate: { ...translate, url: "127.0.0.1:8081" },
      lmstudio: { ...lmstudio, url: "127.0.0.1:1234" },
      strata: { ...strata, url: "127.0.0.1:8080" },
    },
    queue: queue ? { ...queue, current } : null,
    languages: LANGS.map((lang) => ({ lang, ...poStats(lang) })),
    tail: current ? logTail(current) : [],
    files: { logs: existsSync("tmp") ? readdirSync("tmp").filter((f) => f.endsWith(".run.log")).length : 0 },
  };
};

const PAGE = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>TSSR · пульт</title>
<style>
  :root { color-scheme: dark; --bg:#111417; --panel:#171c21; --line:#252c33; --fg:#e6edf3; --muted:#8b98a5; --ok:#3fb950; --bad:#f85149; --warn:#d29922; }
  * { box-sizing: border-box; }
  body { margin:0; padding:20px; background:var(--bg); color:var(--fg); font:14px/1.45 ui-monospace,Consolas,monospace; }
  h1 { font-size:15px; font-weight:600; margin:0 0 14px; color:var(--muted); letter-spacing:.04em; text-transform:uppercase; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px; }
  .card h2 { font-size:11px; margin:0 0 10px; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; }
  .row { display:flex; justify-content:space-between; gap:12px; padding:2px 0; }
  .v { color:#fff; }
  .ok { color:var(--ok); } .bad { color:var(--bad); } .warn { color:var(--warn); } .muted { color:var(--muted); }
  .bar { height:6px; background:#0c0f12; border-radius:3px; overflow:hidden; margin:4px 0 8px; }
  .bar > i { display:block; height:100%; background:var(--ok); }
  .lang { display:grid; grid-template-columns:52px minmax(0,420px) 120px; gap:10px; align-items:center; }
  .tail { white-space:pre-wrap; color:var(--muted); font-size:12px; }
  .big { font-size:22px; }
</style></head><body>
<h1>TSSR · локальный пульт <span id="at" class="muted"></span></h1>
<div class="grid">
  <div class="card"><h2>Бэкенд перевода</h2><div id="tr"></div></div>
  <div class="card"><h2>GPU / CPU / RAM</h2><div id="sys"></div></div>
  <div class="card"><h2>Очередь</h2><div id="queue"></div></div>
  <div class="card"><h2>Последнее в прогоне</h2><div id="tail" class="tail"></div></div>
  <div class="card" style="grid-column:1/-1;max-width:760px"><h2>Языки</h2><div id="langs"></div></div>
</div>
<script>
const $ = (id) => document.getElementById(id);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const up = (s) => s ? '<span class="ok">UP</span>' : '<span class="bad">down</span>';
async function tick() {
  const r = await fetch('/api/state', { cache: 'no-store' });
  const s = await r.json();
  $('at').textContent = s.at.slice(11, 19);
  const sv = s.servers;
  $('tr').innerHTML =
    '<div class="row"><span>llama-server :8081</span><span>' + up(sv.translate.up) + '</span></div>' +
    '<div class="row"><span>модель</span><span class="v">' + (sv.translate.model || '—') + '</span></div>' +
    '<div class="row"><span>LM Studio :1234</span><span>' + up(sv.lmstudio.up) + '</span></div>' +
    '<div class="row"><span>Strata :8080</span><span>' + up(sv.strata.up) + '</span></div>' +
    '<div class="row"><span>llama-server RAM</span><span class="v">' + s.proc.llamaMB + ' МБ</span></div>';
  const g = s.gpu;
  $('sys').innerHTML =
    (g ? '<div class="row"><span>GPU</span><span class="v big">' + g.util + '%</span></div>' +
      '<div class="bar"><i style="width:' + g.util + '%"></i></div>' +
      '<div class="row"><span>видеопамять</span><span class="v">' + (g.usedMiB/1024).toFixed(1) + ' / ' + (g.totalMiB/1024).toFixed(1) + ' ГБ</span></div>' +
      '<div class="row"><span>температура</span><span class="v">' + g.tempC + ' °C</span></div>' : '<div class="muted">nvidia-smi недоступен</div>') +
    '<div class="row"><span>CPU</span><span class="v">' + s.system.cpu + '%</span></div>' +
    '<div class="row"><span>RAM</span><span class="v">' + (s.system.memUsed/1024).toFixed(1) + ' / ' + (s.system.memTotal/1024).toFixed(1) + ' ГБ</span></div>';
  const q = s.queue;
  $('queue').innerHTML = q
    ? '<div class="row"><span>текущий язык</span><span class="v">' + q.lang + '</span></div>' +
      (s.live ? '<div class="row"><span>готово (живо)</span><span class="v">' + s.live.filled + ' / ' + s.live.total + ' (' + pct(s.live.filled, s.live.total) + '%)</span></div>' +
        '<div class="bar"><i style="width:' + pct(s.live.filled, s.live.total) + '%"></i></div>' +
        '<div class="row"><span>скорость</span><span class="v">' + s.live.rate + ' стр/мин</span></div>' +
        '<div class="row"><span>ETA</span><span class="v">' + (s.live.etaMin ? Math.floor(s.live.etaMin / 60) + ' ч ' + (s.live.etaMin % 60) + ' мин' : '—') + '</span></div>' : '') +
      '<div class="row"><span>обновлено</span><span class="muted">' + String(q.at).slice(11, 19) + '</span></div>'
    : '<div class="muted">очередь не запущена</div>';
  $('tail').textContent = (s.tail || []).join('\\n') || '—';
  $('langs').innerHTML = s.languages.map((l) => {
    const p = pct(l.filled, l.total);
    return '<div class="lang" style="margin:6px 0"><b>' + l.lang + '</b>' +
      '<div><div class="bar"><i style="width:' + p + '%;background:' + (p >= 100 ? 'var(--ok)' : p > 3 ? 'var(--warn)' : 'var(--bad)') + '"></i></div></div>' +
      '<span class="muted">' + l.filled + ' · ' + p + '%</span></div>';
  }).join('');
}
tick(); setInterval(tick, 2000);
</script></body></html>`;

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
