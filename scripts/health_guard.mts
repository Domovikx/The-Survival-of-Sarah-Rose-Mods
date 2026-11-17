/**
 * health_guard.mts — страж долгих прогонов: перегрев GPU, нехватка RAM, мало места.
 *
 * Зачем: 2026-11-17 случились три ЖЁСТКИХ ребута за 15 минут (Kernel-Power 41,
 * без BSOD и без WHEA) во время запусков очереди перевода. Такой профиль — это
 * потеря питания (PSU/скачок на GPU) или тепловая защита, а не «синий экран».
 * Windows в этом случае НЕ оставляет дампа, поэтому единственный след — наши
 * собственные показания. Страж пишет CSV на диск каждый тик (с fsync, чтобы
 * успеть до сброса) и при выходе за порог гасит нагрузку.
 *
 * Запуск (из корня репы):
 *   node scripts/health_guard.mts                        # наблюдение, порог → стоп прогонов
 *   node scripts/health_guard.mts --interval 10 --dry     # только логировать
 *   node scripts/health_guard.mts --gpu-temp 82 --free-ram-pct 12
 *
 * Выход: tmp/health.csv (время, GPU temp/power/util/VRAM, CPU%, RAM свободно, диск).
 * После ребута последняя строка CSV — то, что было за секунды до сброса.
 */
import { spawnSync } from "node:child_process";
import { closeSync, fsyncSync, openSync, statfsSync, writeSync } from "node:fs";
import { cpus, freemem, totalmem } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const num = (flag: string, def: number): number => {
  const i = args.indexOf(flag);
  if (i < 0) return def;
  const v = Number(args[i + 1]);
  return Number.isFinite(v) ? v : def;
};
const INTERVAL = num("--interval", 15);
const GPU_TEMP_MAX = num("--gpu-temp", 85);
const FREE_RAM_MIN_PCT = num("--free-ram-pct", 10);
const DISK_FREE_MIN_GB = num("--disk-min-gb", 5);
const DRY = args.includes("--dry");
const CSV = join("tmp", "health.csv");

/** Строка GPU от nvidia-smi (нет утилиты — пусто, страж продолжит по RAM/CPU). */
const gpu = (): { temp: number; power: number; limit: number; util: number; mem: number; thr: string } | null => {
  const r = spawnSync(
    "nvidia-smi",
    [
      "--query-gpu=temperature.gpu,power.draw,power.limit,utilization.gpu,memory.used,clocks_event_reasons.active",
      "--format=csv,noheader,nounits",
    ],
    { encoding: "utf-8", timeout: 8000, windowsHide: true },
  );
  if (r.status !== 0 || !r.stdout) return null;
  const [temp, power, limit, util, mem, thr] = r.stdout
    .trim()
    .split(",")
    .map((s) => s.trim());
  return {
    temp: Number(temp),
    power: Number(power),
    limit: Number(limit),
    util: Number(util),
    mem: Number(mem),
    thr: thr ?? "",
  };
};

/** Загрузка CPU по дельте времён ядер (без spawn — дёшево). */
let prev = cpus();
const cpuPct = (): number => {
  const now = cpus();
  let idle = 0;
  let total = 0;
  for (let i = 0; i < now.length; i++) {
    const a = now[i]!.times;
    const b = prev[i]!.times;
    idle += a.idle - b.idle;
    total += a.user + a.nice + a.sys + a.irq + a.idle - (b.user + b.nice + b.sys + b.irq + b.idle);
  }
  prev = now;
  return total > 0 ? Math.round((100 * (total - idle)) / total) : 0;
};

const diskFreeGb = (): number => {
  try {
    const st = statfsSync(".");
    return (st.bavail * st.bsize) / 1024 ** 3;
  } catch {
    return Number.NaN;
  }
};

/** Своя запись с fsync: при жёстком сбросе ОС данные из кэша теряются. */
const append = (line: string): void => {
  const fd = openSync(CSV, "a");
  try {
    writeSync(fd, line);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
};

/** Погасить нагрузку: очередь перевода и llama-server (звучка/вокс тоже). */
const stopLoad = (): void => {
  const ps = [
    "-NoProfile",
    "-Command",
    "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'translate|voice_batch|vox_queue') -or $_.Name -eq 'llama-server.exe' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Write-Output ('stopped ' + $_.ProcessId) } catch { } }",
  ];
  const r = spawnSync("powershell", ps, { encoding: "utf-8", timeout: 30_000, windowsHide: true });
  append(`${new Date().toISOString()},GUARD,STOPPED,${(r.stdout ?? "").trim().replace(/\n/g, " ")}\n`);
};

if (!Number.isFinite(INTERVAL) || INTERVAL < 5) throw new Error("интервал меньше 5 с — слишком часто");

console.log(
  `health_guard: интервал ${INTERVAL}с | порог GPU ${GPU_TEMP_MAX}°C, RAM свободно ${FREE_RAM_MIN_PCT}%, диск ${DISK_FREE_MIN_GB} ГБ` +
    `${DRY ? " | dry: только логирую" : " | при выходе за порог — гашу прогоны"}`,
);
if (!process.argv.includes("--no-header")) {
  append(
    "ts,gpu_temp_C,gpu_power_W,gpu_limit_W,gpu_util_pct,vram_MiB,cpu_pct,ram_free_pct,ram_free_GB,disk_free_GB,note\n",
  );
}

for (;;) {
  const c = cpuPct();
  const g = gpu();
  const freePct = Math.round((100 * freemem()) / totalmem());
  const freeGb = Number((freemem() / 1024 ** 3).toFixed(1));
  const disk = diskFreeGb();

  const notes: string[] = [];
  if (g && g.temp >= GPU_TEMP_MAX) notes.push(`GPU_ЖАР ${g.temp}°C`);
  if (g && g.limit > 0 && g.power / g.limit >= 0.95) notes.push(`GPU_ПОТОЛОК_ПИТАНИЯ ${g.power}/${g.limit}Вт`);
  if (freePct <= FREE_RAM_MIN_PCT) notes.push(`RAM_МАЛО ${freePct}%`);
  if (disk < DISK_FREE_MIN_GB) notes.push(`ДИСК_МАЛО ${disk.toFixed(1)}ГБ`);

  const line = [
    new Date().toISOString(),
    g?.temp ?? "",
    g?.power ?? "",
    g?.limit ?? "",
    g?.util ?? "",
    g?.mem ?? "",
    c,
    freePct,
    freeGb,
    Number.isFinite(disk) ? disk.toFixed(1) : "",
    notes.join(" "),
  ].join(",");
  append(`${line}\n`);

  console.log(
    `${new Date().toISOString().slice(11, 19)} GPU ${g ? `${g.temp}°C ${g.power}Вт ${g.util}% ${g.mem}MiB` : "n/a"} | CPU ${c}% | RAM ${freePct}% (${freeGb} ГБ) | диск ${Number.isFinite(disk) ? disk.toFixed(1) : "?"} ГБ${notes.length ? ` | ⚠ ${notes.join(" ")}` : ""}`,
  );

  if (notes.length && !DRY) {
    stopLoad();
    console.log("Страж: нагрузка погашена (прогоны остановлены), строка-причина в tmp/health.csv");
    break;
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, INTERVAL * 1000);
}
