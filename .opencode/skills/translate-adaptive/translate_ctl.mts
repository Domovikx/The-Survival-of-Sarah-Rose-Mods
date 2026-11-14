#!/usr/bin/env node
/**
 * translate_ctl.mts — пульт АДАПТИВНОГО перевода: профиль под присутствие
 * владельца, наблюдаемость, быстрое выключение.
 *
 * Зачем: перевод zh идёт ~28 ч. Держать его на полной мощности, пока владелец
 * работает за ПК, нельзя (процессор/GPU/RAM заняты моделью), а гонять щадящий
 * профиль, когда владельца нет, — терять время. Этот пульт переключает профили
 * по простою пользователя (GetLastInputInfo, см. idle.mts) и умеет мгновенно
 * освободить ресурсы одной командой.
 *
 * Команды:
 *   status [--json]          профиль, простой, PID, скорость, ETA, ресурсы
 *   auto [флаги]             watchdog: держит профиль по присутствию владельца
 *   start [--lang zh] [--limit N] [--arc A] [--full]
 *   pause                    остановить переводчик (резюмабельно), бэкенд оставить
 *   stop                     остановить переводчик + Strata (освободить VRAM/RAM)
 *   background | turbo       принудительно применить профиль
 *   log [--tail 30]          хвост журнала перевода
 *
 * Флаги auto: --idle-min 15  порог «отошёл»
 *            --poll 20       период опроса, сек
 *            --cooldown-min 15  кулдаун входа в turbo после выхода
 *            --turbo hard|soft|off  чем именно turbo (hard = рестарт Strata)
 *            --once          один такт (для крона/тестов)
 *            --detach        уйти в фон (используется .cmd)
 *
 * Состояние — tmp/translate_adaptive/{state,samples,config}.json (tmp — расходник).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parsePo } from "../renpy-po/po_core.mts";

import { humanDuration, readIdleSeconds, WIN_PS1 } from "./idle.mts";
import { decideProfile, etaMinutes, speedOf, type Profile, type ProfileState, type Sample } from "./profile.mts";
import { REGISTRY } from "../../../scripts/llm_backend.mts";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..", "..", "..");
const TMP = join(REPO, "tmp");
const STATE_DIR = join(TMP, "translate_adaptive");
const STATE_FILE = join(STATE_DIR, "state.json");
const SAMPLES_FILE = join(STATE_DIR, "samples.json");
const CONFIG_FILE = join(STATE_DIR, "config.json");
const WATCHDOG_PID = join(STATE_DIR, "watchdog.pid");

// ── конфигурация профилей ────────────────────────────────────────────────────
// Замеры 2026-11-14 (tmp/translate_adaptive/measure*.md в отчёте): скорость
// почти не зависит от числа слотов Strata — узкое место пул CPU-экспертов.
// Поэтому turbo по умолчанию «мягкий»: приоритеты, без рестарта бэкенда.
// hard включает SMT-удвоение пула (--pool-cores 0-15) + 8 слотов.
export type TurboMode = "soft" | "hard" | "off";

export interface CtlConfig {
  idleMin: number;
  pollSec: number;
  cooldownMin: number;
  turbo: TurboMode;
  lang: string;
}

export const DEFAULT_CONFIG: CtlConfig = {
  idleMin: 15,
  pollSec: 20,
  cooldownMin: 15,
  turbo: "soft",
  lang: "zh",
};

/** Приоритеты процессов по профилям. */
const PRIO = {
  background: { translator: "BelowNormal", strata: "Normal" },
  turbo: { translator: "AboveNormal", strata: "AboveNormal" },
} as const;

/** Параметры запуска Strata по профилям (для hard turbo). */
export const STRATA_LAUNCH = {
  background: { parallel: 2, context: "16k" },
  // turbo: 8 слотов. ВАЖНО: удвоение пула CPU-экспертов (--pool-cores 0-15)
  // движок 0.1.55 МОЛЧА игнорирует («not an option of this engine»), поэтому
  // единственный ресурс turbo — слоты + приоритеты (замеры 2026-11-14).
  turbo: { parallel: 8, context: "16k" },
};

// ── мелкие утилиты ───────────────────────────────────────────────────────────
function ensureDir(): void {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(path: string, v: unknown): void {
  ensureDir();
  writeFileSync(path, `${JSON.stringify(v, null, 2)}\n`, "utf-8");
}

function ps(args: string[], timeout = 30_000): string {
  return execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", WIN_PS1, ...args], {
    encoding: "utf-8",
    timeout,
    windowsHide: true,
  });
}

export interface Proc {
  pid: number;
  name: string;
  cmd: string;
}

export function listProcesses(runner: (a: string[]) => string = ps): Proc[] {
  const out = runner(["-Cmd", "procs"]);
  const arr = JSON.parse(out) as Proc[] | Proc;
  return Array.isArray(arr) ? arr : [arr];
}

const isTranslator = (p: Proc): boolean => p.name.toLowerCase() === "node.exe" && /translate_run\.mts/.test(p.cmd);
const isStrataServer = (p: Proc): boolean => p.name.toLowerCase() === "python.exe" && /serve\.server/.test(p.cmd);
const isStrataEngine = (p: Proc): boolean => p.name.toLowerCase() === "strata.exe";

export function findTranslator(procs: Proc[]): Proc | null {
  return procs.find(isTranslator) ?? null;
}

export interface StrataInfo {
  server: Proc;
  engine: Proc | null;
  parallel: number | null;
  poolCores: string | null;
}

export function detectStrata(procs: Proc[]): StrataInfo | null {
  const server = procs.find(isStrataServer);
  if (!server) return null;
  const engine = procs.find(isStrataEngine) ?? null;
  const par = /--parallel\s+(\d+)/.exec(server.cmd);
  const pool = engine ? /--pool-cores\s+([0-9,\-:]+)/.exec(engine.cmd) : null;
  return {
    server,
    engine,
    parallel: par ? Number(par[1]) : null,
    poolCores: pool ? pool[1] : null,
  };
}

function setPrio(pid: number, cls: string): string {
  try {
    return ps(["-Cmd", "prio", String(pid), cls]).trim();
  } catch {
    return "?";
  }
}

function killPid(pid: number): void {
  try {
    ps(["-Cmd", "kill", String(pid)]);
  } catch {
    /* уже мёртв */
  }
}

/** PID живого watchdog (null = не запущен / файл устарел). */
function watchdogPid(): number | null {
  if (!existsSync(WATCHDOG_PID)) return null;
  const j = readJson<{ pid?: number }>(WATCHDOG_PID, {});
  const pid = Number(j.pid);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  const alive = listProcesses().some((p) => p.pid === pid);
  return alive ? pid : null;
}

// ── прогресс по po ───────────────────────────────────────────────────────────
export interface PoStats {
  total: number;
  empty: number;
  translated: number;
}

export function poStats(poPath: string): PoStats {
  const text = readFileSync(poPath, "utf-8").replace(/\r\n/g, "\n");
  const entries = parsePo(text).filter((e) => e.msgid);
  const empty = entries.filter((e) => !e.msgstr.trim()).length;
  return { total: entries.length, empty, translated: entries.length - empty };
}

// ── состояние/сэмплы/конфиг ──────────────────────────────────────────────────
function loadState(now: number): ProfileState {
  if (!existsSync(STATE_FILE)) {
    const st = { profile: "background" as Profile, changedAt: now, lastTurboExitAt: null };
    writeJson(STATE_FILE, st);
    return st;
  }
  return readJson<ProfileState>(STATE_FILE, { profile: "background", changedAt: now, lastTurboExitAt: null });
}

function loadConfig(): CtlConfig {
  return { ...DEFAULT_CONFIG, ...readJson<Partial<CtlConfig>>(CONFIG_FILE, {}) };
}

function saveConfig(cfg: CtlConfig): void {
  writeJson(CONFIG_FILE, cfg);
}

function loadSamples(): Sample[] {
  const s = readJson<Sample[]>(SAMPLES_FILE, []);
  return Array.isArray(s) ? s : [];
}

/** Добавляет сэмпл прогресса (не чаще раза в 15 с) и подрезает историю. */
function addSample(translated: number, profile: Profile, now: number): Sample[] {
  const all = loadSamples();
  const last = all[all.length - 1];
  if (last && now - last.t < 15_000) return all;
  const next = [...all, { t: now, translated, profile }].slice(-240);
  writeJson(SAMPLES_FILE, next);
  return next;
}

// ── запуск/остановка ─────────────────────────────────────────────────────────
function backendUrl(): string {
  return REGISTRY.strata.url;
}

export async function strataUp(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`${backendUrl()}/v1/models`, { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

function strataPy(): { py: string; script: string } {
  const base = process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? "", "AppData", "Local");
  return {
    py: join(base, "Strata", "terminal", "current", "python", "python.exe"),
    script: join(base, "Strata", "terminal", "current", "strata.py"),
  };
}

export function strataStop(): void {
  const { py, script } = strataPy();
  try {
    execFileSync(py, [script, "launch", "--stop"], { encoding: "utf-8", timeout: 90_000, windowsHide: true });
  } catch (e) {
    console.error(`  strata stop: ${String(e).slice(0, 120)}`);
  }
}

/** Запуск Strata детачем; profile — какой конфиг (parallel/pool-cores). */
export function strataStart(profile: Profile, logPath: string): void {
  const { py, script } = strataPy();
  const c = STRATA_LAUNCH[profile];
  const args = [
    script,
    "launch",
    "--model",
    "ud-q4_k_xl",
    "--family",
    "qwen36",
    "--context",
    c.context,
    "--parallel",
    String(c.parallel),
    "--vision",
    "off",
    "--tune",
    "skip",
    "--access",
    "local",
    "--port",
    "8080",
    "--no-tui",
    "--yes",
  ];
  const argList = args.map((a) => `'${a}'`).join(",");
  const scriptBlock =
    `Start-Process -FilePath '${py}' -WindowStyle Hidden -PassThru ` +
    `-RedirectStandardOutput '${logPath}' -RedirectStandardError '${logPath}.err' ` +
    `-ArgumentList @(${argList}) | Out-Null`;
  // stdio: "ignore" ОБЯЗАТЕЛЕН: у запущенной Strata остаются живые потомки
  // (strata_control.runtime, движок), и они наследуют пайпы PowerShell —
  // с пайпами Node ждал EOF до таймаута и валил переключение
  // (`spawnSync powershell ETIMEDOUT`, инцидент 2026-11-14), хотя Strata при
  // этом запускалась нормально.
  execFileSync("powershell", ["-NoProfile", "-Command", scriptBlock], {
    stdio: "ignore",
    timeout: 60_000,
    windowsHide: true,
  });
}

/** Ждём, пока порт поднимется/упадёт (мс). */
export async function waitStrata(up: boolean, timeoutMs: number): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const state = await strataUp();
    if (state === up) return true;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

export function startTranslator(cfg: CtlConfig, prio: string, extra: string[] = []): Proc | null {
  const lang = cfg.lang;
  const runLog = join(TMP, `translate_${lang}.run.log`);
  const cmdLine = `node .opencode\\skills\\translate\\translate_run.mts ${lang} ${extra.join(" ")}`.trim();
  const block =
    `$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c ${cmdLine} >> "${runLog}" 2>&1' ` +
    `-WorkingDirectory '${REPO}' -WindowStyle Hidden -PassThru; ` +
    `Start-Sleep -Seconds 6; ` +
    `$n = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*translate_run*' }; ` +
    `foreach ($id in @($n | ForEach-Object { $_.ProcessId })) { try { (Get-Process -Id $id).PriorityClass = '${prio}' } catch {} } ` +
    `$n | Select-Object -First 1 -ExpandProperty ProcessId`;
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-Command", block], {
      encoding: "utf-8",
      timeout: 60_000,
      windowsHide: true,
    }).trim();
    const pid = Number(out.split(/\s+/).pop());
    return pid > 0 ? { pid, name: "node.exe", cmd: cmdLine } : null;
  } catch (e) {
    console.error(`start: ${String(e).slice(0, 200)}`);
    return null;
  }
}

// ── применение профиля ───────────────────────────────────────────────────────
export interface ApplyResult {
  profile: Profile;
  translator: { pid: number; prio: string } | null;
  strata: { restarted: boolean; parallel: number | null; poolCores: string | null; enginePrio?: string | null };
  notes: string[];
}

/** Приводит живую систему к профилю: приоритеты (+рестарт Strata для hard). */
export async function applyProfile(target: Profile, cfg: CtlConfig): Promise<ApplyResult> {
  const notes: string[] = [];
  const res: ApplyResult = {
    profile: target,
    translator: null,
    strata: { restarted: false, parallel: null, poolCores: null },
    notes,
  };
  const step = (m: string): void => {
    notes.push(m);
    console.error(`[${new Date().toISOString()}] applyProfile/${target}: ${m}`);
  };

  // 1. Приоритет переводчика.
  const tr = findTranslator(listProcesses());
  if (tr) {
    const got = setPrio(tr.pid, PRIO[target].translator);
    res.translator = { pid: tr.pid, prio: got };
  } else {
    step("переводчик не запущен — приоритет некому ставить");
  }

  // 2. Бэкенд: приоритет всегда; конфиг (parallel) — только в hard.
  const info = detectStrata(listProcesses());
  if (!info) {
    step("Strata не запущена — профиль применён к тому, что есть");
    return res;
  }
  const want = STRATA_LAUNCH[target];
  const hard = cfg.turbo === "hard";
  const mismatch = info.parallel !== want.parallel;

  if (hard && mismatch) {
    step(`Strata перезапуск: parallel ${info.parallel} -> ${want.parallel}`);
    strataStop();
    await waitStrata(false, 60_000);
    try {
      strataStart(target, join(TMP, `strata_${target}.out.log`));
    } catch (e) {
      step(`запуск Strata упал: ${String(e).slice(0, 200)}`);
      return res;
    }
    step("Strata запускается, ждём порт (до 5 мин)");
    const ok = await waitStrata(true, 300_000);
    step(ok ? "Strata поднялась" : "Strata НЕ поднялась за 5 мин");
    res.strata.restarted = true;
  }

  const after = detectStrata(listProcesses());
  if (after) {
    res.strata.parallel = after.parallel;
    res.strata.poolCores = after.poolCores;
    if (after.engine) res.strata.enginePrio = setPrio(after.engine.pid, PRIO[target].strata);
    if (after.server) setPrio(after.server.pid, PRIO[target].strata);
  }
  return res;
}

// ── status ───────────────────────────────────────────────────────────────────
export interface StatusSnapshot {
  now: number;
  profile: Profile;
  profileForMin: number | null;
  idleSec: number | null;
  cfg: CtlConfig;
  watchdog: number | null;
  translator: { pid: number; prio: string; cpuSec: number; wsMiB: number } | null;
  strata: {
    serverPid: number;
    enginePid: number | null;
    parallel: number | null;
    poolCores: string | null;
    up: boolean;
  } | null;
  progress: PoStats & { remaining: number; percent: number };
  speed: { perMin: number | null; windowMin: number; delta: number; etaMin: number | null };
  sys: { cpu: number; ramTotalMiB: number; ramFreeMiB: number } | null;
  gpu: { util: number; memUsedMiB: number; memTotalMiB: number; powerW: number; tempC: number } | null;
}

function gpuStats(): StatusSnapshot["gpu"] {
  try {
    const out = execFileSync(
      "nvidia-smi",
      [
        "--query-gpu=utilization.gpu,memory.used,memory.total,power.draw,temperature.gpu",
        "--format=csv,noheader,nounits",
      ],
      { encoding: "utf-8", timeout: 8000, windowsHide: true },
    ).trim();
    const [u, mu, mt, p, t] = out.split(",").map((x) => Number(x.trim()));
    return { util: u, memUsedMiB: mu, memTotalMiB: mt, powerW: p, tempC: t };
  } catch {
    return null;
  }
}

export async function snapshot(cfg: CtlConfig): Promise<StatusSnapshot> {
  const now = Date.now();
  const st = loadState(now);
  const procs = listProcesses();
  const tr = findTranslator(procs);
  const strata = detectStrata(procs);

  let translator: StatusSnapshot["translator"] = null;
  if (tr) {
    let cpuSec = 0;
    let wsMiB = 0;
    let prio = "?";
    try {
      const s = ps(["-Cmd", "stats", String(tr.pid)]);
      const j = s.trim() === "null" ? null : (JSON.parse(s) as { prio: string; cpu: number; ws: number });
      if (j) {
        cpuSec = Math.round(j.cpu);
        wsMiB = Math.round(j.ws / 1024 / 1024);
        prio = j.prio;
      }
    } catch {
      /* процесс мог умереть между запросами */
    }
    translator = { pid: tr.pid, prio, cpuSec, wsMiB };
  }

  const po = poStats(join(REPO, "patches", "ai-voice-pack", "po", `${cfg.lang}.po`));
  const samples = addSample(po.translated, st.profile, now);
  const speed = speedOf(samples, now);

  let sys: StatusSnapshot["sys"] = null;
  try {
    sys = JSON.parse(ps(["-Cmd", "sys"])) as StatusSnapshot["sys"];
  } catch {
    /* нет WMI — не критично */
  }

  return {
    now,
    profile: st.profile,
    profileForMin: Math.round((now - st.changedAt) / 60_000),
    idleSec: readIdleSeconds(),
    cfg,
    watchdog: (() => {
      if (!existsSync(WATCHDOG_PID)) return null;
      const pid = Number(readJson<{ pid?: number }>(WATCHDOG_PID, {}).pid);
      return procs.some((p) => p.pid === pid) ? pid : null;
    })(),
    translator,
    strata: strata
      ? {
          serverPid: strata.server.pid,
          enginePid: strata.engine?.pid ?? null,
          parallel: strata.parallel,
          poolCores: strata.poolCores,
          up: await strataUp(),
        }
      : null,
    progress: { ...po, remaining: po.empty, percent: po.total ? (po.translated / po.total) * 100 : 0 },
    speed: { ...speed, etaMin: etaMinutes(po.empty, speed.perMin) },
    sys,
    gpu: gpuStats(),
  };
}

function fmtStatus(s: StatusSnapshot): string {
  const gb = (mib: number): string => (mib / 1024).toFixed(1);
  const idle =
    s.idleSec === null
      ? "неизвестен (детектор не ответил)"
      : s.idleSec / 60 >= s.cfg.idleMin
        ? `отошёл ${humanDuration(s.idleSec)} (порог ${s.cfg.idleMin} мин)`
        : `за ПК (простой ${humanDuration(s.idleSec)})`;
  const lines: string[] = [];
  lines.push(
    `профиль:  ${s.profile.toUpperCase()} ${s.profileForMin !== null ? `(${s.profileForMin} мин)` : ""} | turbo=${s.cfg.turbo} | порог ${s.cfg.idleMin} мин, кулдаун ${s.cfg.cooldownMin} мин`,
  );
  lines.push(`владелец: ${idle}`);
  lines.push(`watchdog: ${s.watchdog === null ? "не запущен (node … auto --detach)" : `pid ${s.watchdog}`}`);
  lines.push(
    s.translator
      ? `перевод:  node ${s.translator.pid} [${s.translator.prio}] ${s.translator.wsMiB} МБ, CPU ${s.translator.cpuSec} с`
      : "перевод:  НЕ ЗАПУЩЕН",
  );
  lines.push(
    s.strata
      ? `бэкенд:   ${s.strata.up ? "UP" : "DOWN"} strata ${s.strata.serverPid}/engine ${s.strata.enginePid ?? "—"} parallel=${s.strata.parallel ?? "?"} pool=${s.strata.poolCores ?? "default"}`
      : "бэкенд:   Strata не запущена",
  );
  lines.push(
    `прогресс: ${s.progress.translated} / ${s.progress.total} (${s.progress.percent.toFixed(1)}%), пусто ${s.progress.empty}`,
  );
  lines.push(
    `скорость: ${s.speed.perMin === null ? "—" : `${s.speed.perMin.toFixed(1)} стр/мин`} (окно ${s.speed.windowMin.toFixed(1)} мин, +${s.speed.delta}) | ETA ${
      s.speed.etaMin === null ? "—" : humanDuration(s.speed.etaMin * 60)
    }`,
  );
  const res: string[] = [];
  if (s.sys)
    res.push(`CPU ${s.sys.cpu}%`, `RAM ${gb(s.sys.ramTotalMiB - s.sys.ramFreeMiB)}/${gb(s.sys.ramTotalMiB)} ГБ`);
  if (s.gpu)
    res.push(
      `GPU ${s.gpu.util}% ${gb(s.gpu.memUsedMiB)}/${gb(s.gpu.memTotalMiB)} ГБ ${s.gpu.powerW} Вт ${s.gpu.tempC} °C`,
    );
  lines.push(`ресурсы:  ${res.join(" | ")}`);
  return lines.join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function flagVal(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

async function cmdAuto(cfg: CtlConfig, argv: string[]): Promise<void> {
  const once = hasFlag(argv, "once");
  if (hasFlag(argv, "detach")) {
    const log = join(TMP, `translate_adaptive.auto.log`);
    // argv[0] уже "auto" — повторно не передаём
    const args = argv.filter((a) => a !== "--detach" && a !== "auto");
    const block = `$p = Start-Process -FilePath 'node.exe' -ArgumentList '${join(HERE, "translate_ctl.mts")}','auto'${args
      .map((a) => `,'${a}'`)
      .join(
        "",
      )} -WorkingDirectory '${REPO}' -WindowStyle Hidden -PassThru -RedirectStandardOutput '${log}' -RedirectStandardError '${log}.err'; $p.Id`;
    // stdio: "ignore" — иначе Node ждёт EOF пайпа, который держит живой
    // детач-потомок (та же грабля, что у strataStart: ETIMEDOUT при успешном
    // запуске). PID берём из файла, который пишет сам watchdog.
    try {
      execFileSync("powershell", ["-NoProfile", "-Command", block], {
        stdio: "ignore",
        timeout: 60_000,
        windowsHide: true,
      });
    } catch (e) {
      console.error(`detach: ${String(e).slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, 2500));
    const pid = existsSync(WATCHDOG_PID) ? String(readJson<{ pid?: number }>(WATCHDOG_PID, {}).pid ?? "?") : "?";
    console.log(`watchdog запущен детачем (pid ${pid}), журнал ${log}`);
    console.log(`остановить: node .opencode/skills/translate-adaptive/translate_ctl.mts watchdog-stop`);
    return;
  }

  writeJson(WATCHDOG_PID, { pid: process.pid, startedAt: Date.now() });
  process.on("exit", () => {
    try {
      if (
        existsSync(WATCHDOG_PID) &&
        String(readJson<{ pid: number }>(WATCHDOG_PID, { pid: 0 }).pid) === String(process.pid)
      ) {
        rmSync(WATCHDOG_PID);
      }
    } catch {
      /* уже нет */
    }
  });

  const log = (msg: string): void => {
    const line = `${new Date().toISOString()} ${msg}`;
    console.log(line);
    // Детач перенаправляет stdout в тот же файл — ручная дозапись дала бы
    // дубли строк (проверено 2026-11-14).
    if (!process.stdout.isTTY) return;
    try {
      writeFileSync(join(TMP, "translate_adaptive.auto.log"), `${line}\n`, { flag: "a" });
    } catch {
      /* лог не критичен */
    }
  };

  const cooldownMs = cfg.cooldownMin * 60_000;
  const runMin = Number(flagVal(argv, "run-min") ?? 0);
  const stopAt = runMin > 0 ? Date.now() + runMin * 60_000 : Number.POSITIVE_INFINITY;
  log(
    `watchdog старт: порог ${cfg.idleMin} мин, опрос ${cfg.pollSec} с, кулдаун ${cfg.cooldownMin} мин, turbo=${cfg.turbo}${runMin > 0 ? `, работаю ${runMin} мин` : ""}`,
  );
  for (;;) {
    const now = Date.now();
    const idleSec = readIdleSeconds();
    const st = loadState(now);
    const d = decideProfile({
      idleSec,
      state: st,
      now,
      idleThresholdSec: cfg.idleMin * 60,
      cooldownMs,
      turboEnabled: cfg.turbo !== "off",
    });
    if (d.changed) {
      // Перед дорогим hard-переключением ещё раз проверяем, что владельца нет.
      if (d.next === "turbo" && (cfg.turbo === "hard" || cfg.turbo === "soft")) {
        const again = readIdleSeconds();
        if (again === null || again < cfg.idleMin * 60) {
          log(`профиль не меняю: простой перепроверен (${again === null ? "?" : Math.round(again / 60)} мин)`);
        } else {
          log(`>>> ${st.profile} -> ${d.next}: ${d.reason}`);
          writeJson(STATE_FILE, d.state);
          const r = await applyProfile(d.next, cfg);
          log(
            `   применено: переводчик ${r.translator ? `${r.translator.pid}[${r.translator.prio}]` : "нет"} | strata parallel=${r.strata.parallel} pool=${r.strata.poolCores}${r.strata.restarted ? " (перезапущена)" : ""}${r.notes.length ? ` | ${r.notes.join("; ")}` : ""}`,
          );
        }
      } else {
        log(`>>> ${st.profile} -> ${d.next}: ${d.reason}`);
        writeJson(STATE_FILE, d.state);
        const r = await applyProfile(d.next, cfg);
        log(
          `   применено: переводчик ${r.translator ? `${r.translator.pid}[${r.translator.prio}]` : "нет"} | strata parallel=${r.strata.parallel} pool=${r.strata.poolCores}${r.strata.restarted ? " (перезапущена)" : ""}${r.notes.length ? ` | ${r.notes.join("; ")}` : ""}`,
        );
      }
    } else if (once) {
      log(`профиль ${st.profile} держим: ${d.reason}`);
    }
    if (once) return;
    if (Date.now() >= stopAt) {
      log("отработал заданное время — выхожу");
      return;
    }
    await new Promise((r) => setTimeout(r, cfg.pollSec * 1000));
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0] ?? "status";
  let cfg = loadConfig();

  // Флаги, которые пишутся в конфиг (живут между запусками).
  let cfgChanged = false;
  const idleMin = flagVal(argv, "idle-min");
  if (idleMin) {
    cfg.idleMin = Number(idleMin);
    cfgChanged = true;
  }
  const poll = flagVal(argv, "poll");
  if (poll) {
    cfg.pollSec = Number(poll);
    cfgChanged = true;
  }
  const cool = flagVal(argv, "cooldown-min");
  if (cool) {
    cfg.cooldownMin = Number(cool);
    cfgChanged = true;
  }
  const turbo = flagVal(argv, "turbo");
  if (turbo) {
    if (!["soft", "hard", "off"].includes(turbo)) {
      console.error("--turbo soft|hard|off");
      process.exit(2);
    }
    cfg.turbo = turbo as TurboMode;
    cfgChanged = true;
  }
  const lang = flagVal(argv, "lang");
  if (lang) {
    cfg.lang = lang;
    cfgChanged = true;
  }
  if (cfgChanged) saveConfig(cfg);

  const now = Date.now();
  const state = loadState(now);

  switch (cmd) {
    case "status": {
      const s = await snapshot(cfg);
      if (hasFlag(argv, "json")) console.log(JSON.stringify(s, null, 2));
      else console.log(fmtStatus(s));
      return;
    }
    case "auto":
      await cmdAuto(cfg, argv);
      return;
    case "start": {
      const extra: string[] = [];
      const limit = flagVal(argv, "limit");
      const arc = flagVal(argv, "arc");
      if (limit) extra.push(String(Number(limit)));
      if (arc) extra.push(arc);
      if (hasFlag(argv, "full")) extra.push("--force");
      const procs = listProcesses();
      if (findTranslator(procs)) {
        console.log("переводчик уже запущен — сначала pause");
        process.exit(1);
      }
      // Бэкенд не поднят (например после `stop`) — поднимаем в текущем профиле:
      // иначе переводчик будет стоять в ожидании [BACKEND-DOWN] до таймаута.
      if (!detectStrata(procs)) {
        console.log(`Strata не запущена — поднимаю (профиль ${state.profile}, ~1–2 мин)`);
        try {
          strataStart(state.profile, join(TMP, `strata_${state.profile}.out.log`));
        } catch (e) {
          console.error(`не удалось запустить Strata: ${String(e).slice(0, 200)}`);
          process.exit(1);
        }
        const ok = await waitStrata(true, 300_000);
        console.log(ok ? "Strata UP" : "Strata НЕ поднялась за 5 мин — переводчик будет ждать бэкенд");
      }
      const prio = PRIO[state.profile].translator;
      const p = startTranslator(cfg, prio, extra);
      if (!p) {
        console.error("не удалось запустить переводчик");
        process.exit(1);
      }
      console.log(`переводчик запущен: node ${p.pid} [${prio}], профиль ${state.profile}`);
      console.log(`журнал: tmp/translate_${cfg.lang}.run.log`);
      return;
    }
    case "pause": {
      const tr = findTranslator(listProcesses());
      if (!tr) {
        console.log("переводчик не запущен — пауза не нужна");
        return;
      }
      killPid(tr.pid);
      console.log(`переводчик остановлен (node ${tr.pid}). Прогресс сохранён: po + tmp/translate_${cfg.lang}.done`);
      console.log("Strata оставлена. Полностью освободить ресурсы: translate_ctl.mts stop");
      return;
    }
    case "stop": {
      const tr = findTranslator(listProcesses());
      if (tr) {
        killPid(tr.pid);
        console.log(`переводчик остановлен (node ${tr.pid})`);
      }
      if (detectStrata(listProcesses())) {
        strataStop();
        const gone = await waitStrata(false, 60_000);
        console.log(
          gone
            ? "Strata остановлена — VRAM/RAM освобождены"
            : "Strata не подтвердила остановку (см. llm_backend.mts status)",
        );
      } else console.log("Strata не запущена");
      return;
    }
    case "background":
    case "turbo": {
      const target = cmd as Profile;
      const d = {
        ...state,
        profile: target,
        changedAt: now,
        lastTurboExitAt: target === "background" ? now : state.lastTurboExitAt,
      };
      writeJson(STATE_FILE, d);
      const r = await applyProfile(target, cfg);
      console.log(
        `профиль ${target}: переводчик ${r.translator ? `${r.translator.pid}[${r.translator.prio}]` : "нет"} | strata parallel=${r.strata.parallel} pool=${r.strata.poolCores}${r.strata.restarted ? " (перезапущена)" : ""}`,
      );
      if (r.notes.length) console.log(`заметки: ${r.notes.join("; ")}`);
      console.log("watchdog не запущен — состояние записано, но `auto` его переопределит по присутствию владельца");
      return;
    }
    case "log": {
      const n = Number(flagVal(argv, "tail") ?? 30);
      const path = join(TMP, `translate_${cfg.lang}.run.log`);
      const text = existsSync(path) ? readFileSync(path, "utf-8").split("\n") : [];
      console.log(text.slice(-n - 1).join("\n"));
      return;
    }
    case "watchdog-stop": {
      const pid = watchdogPid();
      if (pid === null) {
        console.log("watchdog не запущен");
        return;
      }
      killPid(pid);
      try {
        rmSync(WATCHDOG_PID);
      } catch {
        /* нет файла */
      }
      console.log(`watchdog остановлен (pid ${pid})`);
      return;
    }
    default:
      console.error("команды: status|auto|start|pause|stop|background|turbo|log");
      console.error("флаги: --idle-min N --poll S --cooldown-min N --turbo soft|hard|off --lang L --json --tail N");
      process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (e) {
    // Пульт не должен умирать «молча с трейсом»: watchdog и ручные команды
    // живут под этим catch (инцидент 2026-11-14: необработанный throw из
    // execFileSync оставил Strata в промежуточном состоянии без сообщения).
    console.error(`[FATAL] ${new Date().toISOString()} ${e instanceof Error ? `${e.message}\n${e.stack}` : String(e)}`);
    process.exitCode = 1;
  }
}
