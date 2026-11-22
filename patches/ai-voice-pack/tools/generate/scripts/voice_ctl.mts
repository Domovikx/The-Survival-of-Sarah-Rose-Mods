/**
 * voice_ctl.mts — ПУЛЬТ очередей озвучки TSSR (Windows, node, только stdlib).
 *
 * Порт voice_ctl.py на TS (2026-10-30): проект — образец максимального
 * использования TS, python в пайплайне остаётся только под инференс
 * (torch/VoxCPM), а пульт python не требовал. NtSuspendProcess —
 * PowerShell Add-Type с P/Invoke того же ntdll (замена ctypes).
 *
 * Контур ОДИН — VoxCPM2 (CosyVoice3-ветка удалена 2026-11-21). Команды::
 *
 *   node voice_ctl.mts status              # сводка VOX по языкам
 *   node voice_ctl.mts start [lang|all]    # запуск (voice_batch --engine voxcpm2, resumable)
 *   node voice_ctl.mts stop [lang|all]     # остановка (kill-дерева)
 *   node voice_ctl.mts soft-stop [lang] [--timeout 300]  # доделать текущий файл и встать
 *   node voice_ctl.mts pause [lang|all]    # пауза (заморозка оркестраторов)
 *   node voice_ctl.mts resume [lang|all]   # снять с паузы
 *   node voice_ctl.mts watch [--interval 30]  # живой мониторинг
 *   node voice_ctl.mts logs [--lang ru] [-n 20]  # хвост лога
 *
 * `vox-*` — алиасы тех же команд (их зовёт планировщик и vox-*.cmd):
 * `vox-start / vox-stop / vox-pause / vox-resume / vox-lower / vox-auto`.
 * Флаг `--vox` принимается как no-op (совместимость со старыми вызовами).
 *
 * Двойной клик (без админа): voice-status.cmd / voice-watch.cmd и vox-*.cmd.
 *
 * Как это работает:
 *   - очередь = `voice_batch.mts --engine voxcpm2 --lang {lang}` (канон: имена
 *     по контракту {en12}-{state6} {variant}.opus);
 *   - процессы ищутся по cmdline (PowerShell CIM): 'vox_queue.mts'
 *     (обертка) и 'voice_batch.mts'/'voxcpm_bench.mts' (оркестратор) + '--lang {lang}';
 *   - пауза = NtSuspendProcess по оркестраторам (шим доделывает текущую фразу
 *     и замирает), состояние — output/voice/ctl_paused_vox_{lang}.json;
 *   - soft-stop = снять паузу (если была) + дождаться '  saved ' текущего файла
 *     в логе + обычный stop (CPU и RAM свободны);
 *   - генерация resumable: перезапуск продолжает с места останова.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(SCRIPTS_DIR); // generate/

export const VOX_LANGS = ["ru", "en", "de", "es", "fr", "it", "ja", "ko", "pl", "pt", "zh"] as const;
export const VOX_QUEUE_MARK = "vox_queue.mts";
export const VOX_WORKER_MARK = "voxcpm_bench.mts";
export const STALE_LOG_SEC = 180; // лог старше — считаем очередь зависшей

/** Шаблон лога контура: vox_gen_{lang}.log. */
export function logTmpl(): string {
  return join(ROOT, "output", "voice", "vox_gen_{}.log");
}

/** Шаблон метки паузы: ctl_paused_vox_{lang}.json. */
export function pauseTmpl(): string {
  return join(ROOT, "output", "voice", "ctl_paused_vox_{}.json");
}

/** batch.log пишет строки с таймкодом 'HH:MM:SS [n/m] ...' — префикс опционален. */
const PROGRESS_RE = /^(?:\d{1,2}:\d{2}:\d{2}\s+)?\[(\d+)\/(\d+)\]\s+(\S+)\s+(\S+)\s*(.*)$/;
const START_RE = /=== START (\w+) (\w+)/g;
const DONE_RE = /=== DONE (\w+) (\w+)/;
/** 'eta ~100 мин' — свой прогноз voice_batch.mts (последняя строка saved). */
const ETA_RE = /eta ~(\d+)\s*мин/g;

// ---------- чистые хелперы (покрыты тестами) ----------

/**
 * 'ru'/'all'/None -> список языков контура VOX (все 11 po-языков). Ошибка на мусоре.
 */
export function normLangs(arg: string | undefined | null): string[] {
  if (arg === undefined || arg === null || arg === "" || arg === "all" || arg === "both") return [...VOX_LANGS];
  if ((VOX_LANGS as readonly string[]).includes(arg)) return [arg];
  throw new Error(`язык: ${VOX_LANGS.join("|")} или 'all', получен '${arg}'`);
}

/** '[5139/5207] uid Arc Who: текст' -> (done, total) | null. */
export function parseProgressLine(line: string): [number, number] | null {
  const m = PROGRESS_RE.exec(line.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

/**
 * Текст лога -> (activeArc|null, (done,total)|null).
 * activeArc: последний START без DONE после него; прогресс: последний [n/m].
 * Фолбэк: если меток START в логе нет (batch.log нового демо-контура
 * voice_batch --engine voxcpm2), арка берётся из последней строки прогресса.
 */
export function parseLogState(text: string): [string | null, [number, number] | null] {
  let arc: string | null = null;
  let lastStart: [number, string] | null = null;
  for (const m of text.matchAll(START_RE)) lastStart = [m.index, m[2]];
  if (lastStart) {
    const [pos, a] = lastStart;
    arc = DONE_RE.test(text.slice(pos)) ? null : a;
  }
  let prog: [number, number] | null = null;
  let progArc: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const m = PROGRESS_RE.exec(line.trim());
    if (!m) continue;
    prog = [Number(m[1]), Number(m[2])];
    progArc = m[4];
  }
  return [arc ?? (lastStart ? null : progArc), prog];
}

/** Последний 'eta ~N мин' из лога voice_batch (минуты) | null. */
export function parseEta(text: string): number | null {
  let eta: number | null = null;
  for (const m of text.matchAll(ETA_RE)) eta = Number(m[1]);
  return eta;
}

/** Секунды -> '12 сек' / '5 мин' / '2 ч' / '3 дн'. */
export function formatAge(sec: number): string {
  const s = Math.trunc(sec);
  if (s < 90) return `${s} сек`;
  if (s < 5400) return `${Math.trunc(s / 60)} мин`;
  if (s < 172800) return `${Math.trunc(s / 3600)} ч`;
  return `${Math.trunc(s / 86400)} дн`;
}

/** Число готовых файлов в логе: строки '  saved ...' (пишет voice_batch.mts). */
export function countSaved(text: string): number {
  if (!text) return 0;
  let n = 0;
  for (const line of text.split(/\r?\n/)) if (line.includes("  saved ")) n++;
  return n;
}

/** Процесс-очередь языка: node vox_queue.mts {lang}. */
export function isQueueProc(cmd: string, lang: string): boolean {
  return cmd.includes(VOX_QUEUE_MARK) && cmd.split(/\s+/).includes(lang);
}

/**
 * Оркестратор генерации языка: node voice_batch.mts --lang | node voxcpm_bench.mts --lang.
 *
 * CosyVoice3-движка больше нет (2026-11-21), поэтому voice_batch.mts без флага
 * движка — уже VOX. Легаси-бенч voxcpm_bench.mts — всегда vox; `--engine voxcpm`
 * тоже считается vox (на случай явного флага).
 *
 * Пауза морозит ОРКЕСТРАТОР (ноду), а не python-шим: шим доделывает текущую
 * фразу (файл цел) и замирает в ожидании. Шим (voxcpmworker.py) в cmdline не
 * несёт ни маркера, ни --lang — матчить его отдельно нельзя.
 */
export function isWorkerProc(cmd: string, lang: string): boolean {
  if (!cmd.includes(`--lang ${lang}`)) return false;
  return cmd.includes(VOX_WORKER_MARK) || cmd.includes("voice_batch.mts") || /--engine\s+voxcpm/.test(cmd);
}

// ---------- процессы Windows ----------

interface ProcRow {
  pid: number;
  cmd: string;
}

/**
 * Все процессы: [{pid, cmd}] через PowerShell CIM (JSON — надёжнее CSV
 * для cmdline с запятыми/кавычками). Пусто при ошибке/таймауте.
 */
export function listProcesses(): ProcRow[] {
  const ps =
    "[Console]::OutputEncoding=[Text.Encoding]::UTF8; " +
    "ConvertTo-Json -Compress -InputObject @" +
    "(Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine)";
  try {
    const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], {
      encoding: "utf-8",
      timeout: 60_000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (r.status !== 0 || !r.stdout) return [];
    const data = JSON.parse(r.stdout) as Array<{
      ProcessId: number;
      CommandLine: string | null;
    }> | null;
    if (!Array.isArray(data)) return [];
    return data.flatMap((row) =>
      typeof row?.ProcessId === "number" ? [{ pid: row.ProcessId, cmd: row.CommandLine ?? "" }] : [],
    );
  } catch {
    return [];
  }
}

/** PID очередей языка: node vox_queue.mts. */
export function findQueues(lang: string): number[] {
  return listProcesses()
    .filter((p) => isQueueProc(p.cmd, lang))
    .map((p) => p.pid);
}

/** PID оркестраторов генерации языка (voice_batch.mts | voxcpm_bench.mts). */
export function findWorkers(lang: string): number[] {
  return listProcesses()
    .filter((p) => isWorkerProc(p.cmd, lang))
    .map((p) => p.pid);
}

/** taskkill /F [/T]. True если процесс убит/уже нет. */
export function taskkill(pid: number, tree = false): boolean {
  const args = ["taskkill", "/PID", String(pid), "/F", ...(tree ? ["/T"] : [])];
  try {
    return spawnSync(args[0], args.slice(1), { windowsHide: true, timeout: 30_000, stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

const NT_PInvoke = [
  "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class TssrNt {",
  '[DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);',
  '[DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);',
  '[DllImport("ntdll.dll")] public static extern int NtSuspendProcess(IntPtr h);',
  '[DllImport("ntdll.dll")] public static extern int NtResumeProcess(IntPtr h);',
  "[StructLayout(LayoutKind.Sequential)] public struct PROCESS_POWER_THROTTLING_STATE { public uint Version; public uint ControlMask; public uint StateMask; }",
  '[DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetProcessInformation(IntPtr hProcess, int infoClass, ref PROCESS_POWER_THROTTLING_STATE state, int size);',
  "}'",
].join(" ");

/** Заморозка/разморозка процесса (NtSuspendProcess/NtResumeProcess). Бросает Error. */
function ntControl(pid: number, resume: boolean): void {
  const fn = resume ? "NtResumeProcess" : "NtSuspendProcess";
  const ps =
    `${NT_PInvoke}; $h=[TssrNt]::OpenProcess(0x800,$false,${pid}); ` + // 0x800 = PROCESS_SUSPEND_RESUME
    `if($h -eq [IntPtr]::Zero){exit 1}; $rc=[TssrNt]::${fn}($h); [TssrNt]::CloseHandle($h); exit $rc`;
  const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], {
    timeout: 60_000,
    windowsHide: true,
    stdio: "ignore",
  });
  if (r.status !== 0) throw new Error(`${fn}(${pid}) rc=${r.status}`);
}

export function suspendProcess(pid: number): void {
  ntControl(pid, false);
}

export function resumeProcess(pid: number): void {
  ntControl(pid, true);
}

/** Понизить приоритет процесса (не фатально при ошибке). */
export function setBelowNormal(pid: number): void {
  try {
    spawnSync(
      "powershell",
      ["-NoProfile", "-Command", `(Get-Process -Id ${pid} -ErrorAction Stop).PriorityClass = 'BelowNormal'`],
      { windowsHide: true, timeout: 30_000, stdio: "ignore" },
    );
  } catch {
    /* не фатально */
  }
}

function setEcoQos(pid: number): void {
  if (!isWin()) return;
  const ps =
    NT_PInvoke +
    `; $h=[TssrNt]::OpenProcess(0x1F0FFF,$false,${pid}); if($h -ne [IntPtr]::Zero){ $s=New-Object TssrNt+PROCESS_POWER_THROTTLING_STATE; $s.Version=1; $s.ControlMask=1; $s.StateMask=1; [void][TssrNt]::SetProcessInformation($h,4,[ref]$s,[Runtime.InteropServices.Marshal]::SizeOf($s)); [TssrNt]::CloseHandle($h) }`;
  try {
    spawnSync("powershell", ["-NoProfile", "-Command", ps], { windowsHide: true, timeout: 15_000, stdio: "ignore" });
  } catch {
    /* не фатально */
  }
}

function setAffinity(pid: number, maxCores: number): void {
  if (!isWin() || maxCores <= 0) return;
  // Битовая маска для maxCores (по умолчанию оставляем часть ядер под систему)
  const mask = maxCores >= 64 ? BigInt("0xFFFFFFFFFFFFFFFF") : (BigInt(1) << BigInt(maxCores)) - BigInt(1);
  const ps = `
$code = @'
using System;
using System.Runtime.InteropServices;
public class TssrAff {
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool SetProcessAffinityMask(IntPtr hProcess, IntPtr dwProcessAffinityMask);
  [DllImport("kernel32.dll")]
  public static extern bool CloseHandle(IntPtr hObject);
}
'@
Add-Type -TypeDefinition $code
$h=[TssrAff]::OpenProcess(0x0200,$false,${pid})
if($h -ne [IntPtr]::Zero){
  $m=[IntPtr]${mask}
  [void][TssrAff]::SetProcessAffinityMask($h,$m)
  [TssrAff]::CloseHandle($h)
}
`;
  try {
    spawnSync("powershell", ["-NoProfile", "-Command", ps], { windowsHide: true, timeout: 15_000, stdio: "ignore" });
  } catch {
    /* не фатально */
  }
}

/** Понизить приоритет ВСЕЙ VOX-ветки (voice_batch + queue + bench + worker) + EcoQoS + ограничение ядер. */
export function lowerVoxPriority(cfg?: VoxAutoCfg): void {
  if (!isWin()) return;
  const c = cfg ?? getVoxAutoCfg();
  for (const p of listProcesses()) {
    const cmd = p.cmd.toLowerCase();
    if (
      cmd.includes("voice_batch.mts") ||
      cmd.includes(VOX_QUEUE_MARK) ||
      cmd.includes(VOX_WORKER_MARK) ||
      cmd.includes("voxcpmworker.py") ||
      (cmd.includes("voxcpm") && cmd.includes("bench"))
    ) {
      try {
        spawnSync(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            `$p = Get-Process -Id ${p.pid} -ErrorAction SilentlyContinue; if ($p) { try { $p.PriorityClass = 'BelowNormal' } catch {} }`,
          ],
          { windowsHide: true, timeout: 10_000, stdio: "ignore" },
        );
      } catch {
        /* не фатально */
      }
      setEcoQos(p.pid);
      setAffinity(p.pid, c.maxCores);
    }
  }
}

// ---------- состояние очередей ----------

const fmt = (t: string, lang: string): string => t.replace("{}", lang);

export function readLog(lang: string): string {
  try {
    return readFileSync(fmt(logTmpl(), lang), "utf-8");
  } catch {
    return "";
  }
}

export interface PauseState {
  pids: number[];
  at: string;
}

export function pauseState(lang: string): PauseState | null {
  try {
    return JSON.parse(readFileSync(fmt(pauseTmpl(), lang), "utf-8")) as PauseState;
  } catch {
    return null;
  }
}

// ---------- статусы ----------

export interface LangStatus {
  lang: string;
  state: "PAUSED" | "RUNNING" | "STALLED" | "STOPPED";
  workers: number[];
  queues: number[];
  paused: PauseState | null;
  arc: string | null;
  prog: [number, number] | null;
  logAge: number | null;
  /** Прогноз voice_batch из лога ('eta ~N мин') — только если там есть. */
  etaMin?: number | null;
}

/**
 * Сводка языка или null, если про язык ничего неизвестно (пустых блоков не плодим).
 *
 * voice_batch.mts --engine voxcpm2 пишет ОБЩИЙ batch.log, а не vox_gen_{lang}.log —
 * пока воркер языка жив, читаем batch.log (прогресс/ETA там же, где их видит
 * оператор); у остановленного языка — свой per-language лог.
 */
export function langStatus(lang: string): LangStatus | null {
  const workers = findWorkers(lang);
  const queues = findQueues(lang);
  const paused = pauseState(lang);
  const ownPath = fmt(logTmpl(), lang);
  const batchPath = join(ROOT, "output", "voice", "batch.log");
  const path = workers.length > 0 && existsSync(batchPath) ? batchPath : ownPath;
  let text = "";
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    text = "";
  }
  const hasLog = existsSync(path);
  if (!(workers.length || queues.length || paused || text || hasLog)) return null;
  const [arc, prog] = text ? parseLogState(text) : [null, null];
  let logAge: number | null = null;
  try {
    logAge = Date.now() / 1000 - statSync(path).mtimeMs / 1000;
  } catch {
    logAge = null;
  }
  const state: LangStatus["state"] = paused
    ? "PAUSED"
    : workers.length || queues.length
      ? logAge !== null && logAge < STALE_LOG_SEC
        ? "RUNNING"
        : "STALLED"
      : "STOPPED";
  return { lang, state, workers, queues, paused, arc, prog, logAge, etaMin: parseEta(text) };
}

export function printStatus(langs: readonly string[] = VOX_LANGS): number {
  const rows = langs.flatMap((lang) => {
    const s = langStatus(lang);
    return s ? [[lang, s] as const] : [];
  });
  if (!rows.length) {
    console.log("--- VOX: не запускалась (node voice_ctl.mts start [lang|all]) ---");
    return 0;
  }
  console.log(`=== ОЗВУЧКА (VOX): ${new Date().toTimeString().slice(0, 8)} ===`);
  for (const [lang, s] of rows) {
    let line = `  ${lang.toUpperCase()}: ${s.state}`;
    if (s.arc) {
      line += ` арка: ${s.arc}`;
      if (s.prog) line += ` [${s.prog[0]}/${s.prog[1]}]`;
    } else if (s.prog) {
      line += ` прогресс: [${s.prog[0]}/${s.prog[1]}]`;
    }
    if (s.logAge !== null) line += `, лог: ${formatAge(s.logAge)} назад`;
    if (s.paused) line += `, ПАУЗА с ${s.paused.at}`;
    if (s.etaMin !== null && s.etaMin !== undefined) line += `, eta ~${s.etaMin} мин`;
    console.log(line);
  }
  return 0;
}

// ---------- команды ----------

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const isWin = (): boolean => process.platform === "win32";

export interface CtlArgs {
  cmd?: string;
  lang?: string;
  /** Принят ради совместимости (старые вызовы `--vox`): контур всегда один — VOX. */
  vox: boolean;
  timeout: number;
  interval: number;
  n: number;
}

/** Разбор CLI: команда + позиционный язык + опции (--timeout/--interval/-n/--vox/--lang). */
export function parseCtlCli(argv: string[]): CtlArgs {
  const a: CtlArgs = { vox: false, timeout: 300, interval: 30, n: 20 };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`нет значения у ${arg}`);
      return v;
    };
    switch (arg) {
      case "--vox":
        a.vox = true;
        break;
      case "--lang":
        a.lang = next();
        break;
      case "--timeout":
        a.timeout = Math.max(10, Number(next()) || 300);
        break;
      case "--interval":
        a.interval = Math.max(5, Number(next()) || 30);
        break;
      case "-n":
      case "--n":
        a.n = Math.max(1, Number(next()) || 20);
        break;
      case "--help":
      case "-h":
        throw new Error("HELP");
      default:
        if (arg.startsWith("-")) throw new Error(`неизвестная опция: ${arg}`);
        positional.push(arg);
    }
  }
  a.cmd = positional[0];
  a.lang = a.lang ?? positional[1];
  return a;
}

const CTL_HELP = `Пульт очередей озвучки TSSR (контур VOX / VoxCPM2)

  status [lang|all]              сводка VOX по языкам
  start|stop|pause|resume [lang|all]  управление очередями (11 языков)
  soft-stop [lang] [--timeout N] доделать текущий файл и встать
  watch [--interval N]           живой мониторинг (Ctrl+C — выход)
  logs [--lang lang] [-n N]      хвост per-language лога (vox_gen_<lang>.log)
  lower                          понизить приоритет VOX-ветки до BelowNormal + EcoQoS + affinity
  vox-auto start|stop|status      автотроттлинг: пауза при нагрузке, возобновление при простое

  Алиасы (их зовёт планировщик и vox-*.cmd): vox-start|vox-stop|vox-pause|vox-resume,
  vox-lower, vox-auto. Флаг --vox принимается как no-op (совместимость).`;

function cmdStatus(a: CtlArgs): number {
  return printStatus(normLangs(a.lang));
}

async function cmdStart(a: CtlArgs): Promise<number> {
  if (!isWin()) {
    console.log("start: только Windows");
    return 1;
  }
  // Канон — `voice_batch.mts --engine voxcpm2`: он пишет ФАЙЛЫ ПО КОНТРАКТУ
  // `{en12}-{state6} {variant}.opus`. Легаси `vox_queue.mts` звал бенч, и тот
  // складывал в audio/ имена `{uid}__{voice}__Vox_cfg...`, которые движок НЕ
  // находит (баг 2026-11-20: 1 851 такой файл в audio/en при живом «прогрессе»).
  const cmd = [process.execPath, join(SCRIPTS_DIR, "voice_batch.mts"), "--engine", "voxcpm2"];
  let rc = 0;
  for (const lang of normLangs(a.lang)) {
    if (findQueues(lang).length || findWorkers(lang).length) {
      console.log(`${lang.toUpperCase()}: уже запущено, пропуск`);
      continue;
    }
    let pid: number;
    try {
      const p = spawn(cmd[0], [...cmd.slice(1), "--lang", lang], {
        cwd: ROOT,
        stdio: "ignore",
        detached: true,
        windowsHide: true,
      });
      if (p.pid === undefined) throw new Error("нет pid");
      pid = p.pid;
      p.unref();
    } catch (e) {
      console.log(`${lang.toUpperCase()}: не стартовал: ${e instanceof Error ? e.message : String(e)}`);
      rc = 1;
      continue;
    }
    setBelowNormal(pid);
    await sleep(5000);
    lowerVoxPriority(getVoxAutoCfg());
    if (findQueues(lang).length || findWorkers(lang).length) {
      console.log(`${lang.toUpperCase()}: запущено (pid ${pid}), лог output/voice/batch.log`);
    } else {
      console.log(
        `${lang.toUpperCase()}: стартовал, но очередь не видна — запуск: node voice_ctl.mts start [lang|all]`,
      );
    }
  }
  return rc;
}

async function killLangTree(lang: string, label: string): Promise<number> {
  let killed = 0;
  for (const pid of findQueues(lang)) if (taskkill(pid, true)) killed++;
  await sleep(2000);
  for (const pid of findWorkers(lang)) if (taskkill(pid, true)) killed++;
  try {
    rmSync(fmt(pauseTmpl(), lang), { force: true });
  } catch {
    /* метки могло не быть */
  }
  const left = [...findWorkers(lang), ...findQueues(lang)];
  if (left.length) {
    console.log(`${lang.toUpperCase()}: осталось висеть: ${left.join(", ")} — добей вручную (taskkill)`);
    return 1;
  }
  console.log(`${lang.toUpperCase()}: ${label} (убито ${killed})`);
  return 0;
}

async function cmdStop(a: CtlArgs): Promise<number> {
  if (!isWin()) {
    console.log("stop: только Windows");
    return 1;
  }
  let rc = 0;
  for (const lang of normLangs(a.lang)) rc |= await killLangTree(lang, "остановлено");
  console.log("Готовые файлы целы, рестарт продолжит (resumable).");
  return rc;
}

async function cmdPause(a: CtlArgs): Promise<number> {
  if (!isWin()) {
    console.log("pause: только Windows");
    return 1;
  }
  let rc = 0;
  for (const lang of normLangs(a.lang)) {
    if (pauseState(lang)) {
      console.log(`${lang.toUpperCase()}: уже на паузе (resume чтобы снять)`);
      continue;
    }
    const pids = findWorkers(lang);
    if (!pids.length) {
      console.log(`${lang.toUpperCase()}: нечего морозить (воркеров нет)`);
      continue;
    }
    const frozen: number[] = [];
    for (const pid of pids) {
      try {
        suspendProcess(pid);
        frozen.push(pid);
      } catch (e) {
        console.log(`${lang.toUpperCase()}: pid ${pid} не заморожен: ${e instanceof Error ? e.message : String(e)}`);
        rc = 1;
      }
    }
    writeFileSync(
      fmt(pauseTmpl(), lang),
      JSON.stringify({ pids: frozen, at: new Date().toLocaleString("sv-SE").slice(0, 19).replace("T", " ") }),
      "utf-8",
    );
    console.log(`${lang.toUpperCase()}: пауза (заморожено ${frozen.length}: ${frozen.join(", ")})`);
  }
  return rc;
}

async function cmdResume(a: CtlArgs): Promise<number> {
  if (!isWin()) {
    console.log("resume: только Windows");
    return 1;
  }
  let rc = 0;
  for (const lang of normLangs(a.lang)) {
    const st = pauseState(lang);
    if (!st) {
      console.log(`${lang.toUpperCase()}: не на паузе`);
      continue;
    }
    const alive = new Set(findWorkers(lang));
    let resumed = 0;
    for (const pid of st.pids ?? []) {
      if (!alive.has(pid)) {
        console.log(`${lang.toUpperCase()}: pid ${pid} уже нет (перезапустился?)`);
        continue;
      }
      try {
        resumeProcess(pid);
        resumed++;
      } catch (e) {
        console.log(`${lang.toUpperCase()}: pid ${pid} не разморожен: ${e instanceof Error ? e.message : String(e)}`);
        rc = 1;
      }
    }
    try {
      rmSync(fmt(pauseTmpl(), lang), { force: true });
    } catch {
      /* метки могло не быть */
    }
    console.log(`${lang.toUpperCase()}: снято с паузы (${resumed})`);
  }
  await sleep(2000);
  lowerVoxPriority(getVoxAutoCfg());
  return rc;
}

/**
 * Мягкая остановка: снять паузу (иначе файл не доделается) + дождаться нового
 * '  saved ' в логе (таймаут --timeout) + обычный stop. CPU/RAM свободны,
 * готовые файлы целы, рестарт продолжает (resumable).
 */
async function cmdSoftStop(a: CtlArgs): Promise<number> {
  if (!isWin()) {
    console.log("soft-stop: только Windows");
    return 1;
  }
  let rc = 0;
  for (const lang of normLangs(a.lang)) {
    if (!(findQueues(lang).length || findWorkers(lang).length || pauseState(lang))) {
      console.log(`${lang.toUpperCase()}: уже остановлено`);
      continue;
    }
    // 1. снять паузу, если была
    const st = pauseState(lang);
    if (st) {
      const alive = new Set(findWorkers(lang));
      let resumed = 0;
      for (const pid of st.pids ?? []) {
        if (!alive.has(pid)) continue;
        try {
          resumeProcess(pid);
          resumed++;
        } catch (e) {
          console.log(`${lang.toUpperCase()}: pid ${pid} не разморожен: ${e instanceof Error ? e.message : String(e)}`);
          rc = 1;
        }
      }
      try {
        rmSync(fmt(pauseTmpl(), lang), { force: true });
      } catch {
        /* метки могло не быть */
      }
      console.log(`${lang.toUpperCase()}: снято с паузы (${resumed}), жду текущий файл...`);
    }
    // 2. ждать доделки текущего файла (новый '  saved ' в логе).
    // Канон пишет общий batch.log, стенд — per-language vox_gen; считаем оба.
    const batchLog = join(ROOT, "output", "voice", "batch.log");
    const savedNow = (): number => {
      let n = countSaved(readLog(lang));
      try {
        n += countSaved(readFileSync(batchLog, "utf-8"));
      } catch {
        /* batch.log ещё не создан */
      }
      return n;
    };
    const base = savedNow();
    const deadline = Date.now() + a.timeout * 1000;
    let finished = false;
    while (Date.now() < deadline) {
      await sleep(5000);
      if (!findWorkers(lang).length && !findQueues(lang).length) {
        console.log(`${lang.toUpperCase()}: очередь сама завершилась`);
        finished = true;
        break;
      }
      if (savedNow() > base) {
        console.log(`${lang.toUpperCase()}: текущий файл доделан`);
        finished = true;
        break;
      }
    }
    if (!finished) {
      console.log(
        `${lang.toUpperCase()}: таймаут ${a.timeout}с — останавливаю жёстко (текущий файл доделается при рестарте)`,
      );
    }
    // 3. обычная зачистка как в stop
    rc |= await killLangTree(lang, "мягко остановлено");
  }
  console.log("Готовые файлы целы, рестарт продолжит (resumable).");
  return rc;
}

async function cmdWatch(a: CtlArgs): Promise<number> {
  const langs = normLangs(a.lang);
  console.log(`Мониторинг каждые ${a.interval} сек, Ctrl+C — выход.`);
  let stop = false;
  process.on("SIGINT", () => {
    stop = true;
  });
  while (!stop) {
    spawnSync(isWin() ? "cmd" : "sh", isWin() ? ["/c", "cls"] : ["-c", "clear"], { stdio: "inherit" });
    printStatus(langs);
    console.log("\nCtrl+C — выход.");
    await sleep(a.interval * 1000);
  }
  console.log("\nВыход.");
  return 0;
}

function cmdLowerPriority(): number {
  if (!isWin()) {
    console.log("lower-priority: только Windows");
    return 1;
  }
  const c = getVoxAutoCfg();
  lowerVoxPriority(c);
  console.log(`VOX-процессы понижены до BelowNormal + EcoQoS + affinity ${c.maxCores} ядер (queue/bench/worker)`);
  return 0;
}

const VOX_AUTO_CFG = join(ROOT, "output", "voice", "vox_auto.json");
const VOX_AUTO_PID = join(ROOT, "output", "voice", "vox_auto.pid");

interface VoxAutoCfg {
  cpuHigh: number;
  cpuLow: number;
  gpuHigh: number;
  gpuLow: number;
  intervalSec: number;
  idleSec: number;
  langs: string[];
  maxCores: number;
}

function getVoxAutoCfg(): VoxAutoCfg {
  try {
    const c = JSON.parse(readFileSync(VOX_AUTO_CFG, "utf-8")) as Partial<VoxAutoCfg>;
    return {
      cpuHigh: c.cpuHigh ?? 25,
      cpuLow: c.cpuLow ?? 12,
      gpuHigh: c.gpuHigh ?? 50,
      gpuLow: c.gpuLow ?? 25,
      intervalSec: c.intervalSec ?? 10,
      idleSec: c.idleSec ?? 40,
      langs: Array.isArray(c.langs) && c.langs.length ? c.langs : ["ru", "en", "es"],
      maxCores: typeof c.maxCores === "number" && c.maxCores > 0 ? Math.min(c.maxCores, 64) : 6,
    };
  } catch {
    return {
      cpuHigh: 25,
      cpuLow: 12,
      gpuHigh: 50,
      gpuLow: 25,
      intervalSec: 10,
      idleSec: 40,
      langs: ["ru", "en", "es"],
      maxCores: 6,
    };
  }
}

function saveVoxAutoCfg(c: VoxAutoCfg): void {
  try {
    mkdirSync(dirname(VOX_AUTO_CFG), { recursive: true });
    writeFileSync(VOX_AUTO_CFG, JSON.stringify(c, null, 2), "utf-8");
  } catch {
    /* не фатально */
  }
}

function getCpuLoad(): number | null {
  if (!isWin()) return null;
  const ps =
    "[Console]::OutputEncoding=[Text.Encoding]::UTF8; " +
    "$m=Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter \\\"Name='_Total'\\\"; " +
    "if($m){$m.PercentProcessorTime}else{Get-Counter '\\\\Processor(_Total)\\\\% Processor Time' -SampleInterval 1 -MaxSamples 1 | % {$_.CounterSamples[0].CookedValue}}";
  try {
    const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], {
      encoding: "utf-8",
      timeout: 15_000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (r.status !== 0 || !r.stdout) return null;
    const v = Number(r.stdout.trim().split(/\s+/).pop());
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
  } catch {
    return null;
  }
}

function getGpuLoad(): { util: number | null; used: number | null; free: number | null } {
  try {
    const r = spawnSync(
      "nvidia-smi",
      ["--query-gpu=utilization.gpu,memory.used,memory.free", "--format=csv,noheader,nounits"],
      { encoding: "utf-8", timeout: 10_000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    if (r.status !== 0 || !r.stdout) return { util: null, used: null, free: null };
    const line = r.stdout.trim().split(/\n/)[0];
    const [u, used, free] = line.split(",").map((x) => Number(x.trim()));
    return {
      util: Number.isFinite(u) ? Math.max(0, Math.min(100, u)) : null,
      used: Number.isFinite(used) ? used : null,
      free: Number.isFinite(free) ? free : null,
    };
  } catch {
    return { util: null, used: null, free: null };
  }
}

function getLastInputSeconds(): number | null {
  if (!isWin()) return null;
  const ps =
    'Add-Type -TypeDefinition \'using System;using System.Runtime.InteropServices;public struct LASTINPUTINFO{public uint cbSize;public uint dwTime;} public class TssrInput{[DllImport("user32.dll")]public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);[DllImport("kernel32.dll")]public static extern uint GetTickCount();}\'' +
    "; $li=New-Object LASTINPUTINFO; $li.cbSize=[Runtime.InteropServices.Marshal]::SizeOf($li); if([TssrInput]::GetLastInputInfo([ref]$li)){([TssrInput]::GetTickCount()-$li.dwTime)/1000}else{9999}";
  try {
    const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], {
      encoding: "utf-8",
      timeout: 10_000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (r.status !== 0 || !r.stdout) return null;
    const v = Number(r.stdout.trim().split(/\s+/).pop());
    return Number.isFinite(v) && v >= 0 ? v : null;
  } catch {
    return null;
  }
}

function readVoxAutoPid(): number | null {
  try {
    const p = Number(readFileSync(VOX_AUTO_PID, "utf-8").trim());
    if (!Number.isFinite(p) || p <= 0) return null;
    // проверка живой
    const r = spawnSync("tasklist", ["/FI", `PID eq ${p}`], { encoding: "utf-8", timeout: 5_000, windowsHide: true });
    if (r.status !== 0) return null;
    if (!r.stdout.includes(String(p))) return null;
    return p;
  } catch {
    return null;
  }
}

function killVoxAuto(): boolean {
  const pid = readVoxAutoPid();
  if (!pid) {
    try {
      rmSync(VOX_AUTO_PID, { force: true });
    } catch {}
    return false;
  }
  const ok = taskkill(pid, true);
  try {
    rmSync(VOX_AUTO_PID, { force: true });
  } catch {}
  return ok;
}

function pauseAllVoxLangs(langs: string[]): void {
  for (const lang of langs) {
    try {
      if (pauseState(lang)) continue;
      const pids = findWorkers(lang);
      if (!pids.length) continue;
      const frozen: number[] = [];
      for (const pid of pids) {
        try {
          suspendProcess(pid);
          frozen.push(pid);
        } catch {}
      }
      if (frozen.length) {
        writeFileSync(
          fmt(pauseTmpl(), lang),
          JSON.stringify({ pids: frozen, at: new Date().toLocaleString("sv-SE").slice(0, 19).replace("T", " ") }),
          "utf-8",
        );
      }
    } catch {}
  }
}

function resumeAllVoxLangs(langs: string[]): void {
  for (const lang of langs) {
    try {
      const st = pauseState(lang);
      if (!st) continue;
      const alive = new Set(findWorkers(lang));
      for (const pid of st.pids ?? []) {
        if (!alive.has(pid)) continue;
        try {
          resumeProcess(pid);
        } catch {}
      }
      try {
        rmSync(fmt(pauseTmpl(), lang), { force: true });
      } catch {}
    } catch {}
  }
}

async function voxAutoLoop(): Promise<void> {
  const cfg = getVoxAutoCfg();
  mkdirSync(dirname(VOX_AUTO_PID), { recursive: true });
  writeFileSync(VOX_AUTO_PID, String(process.pid), "utf-8");
  let idleSince = Date.now();
  let busySince = 0;
  // применяем приоритет сразу
  lowerVoxPriority(cfg);
  console.log(
    `[vox-auto] запущен, пороги cpu>${cfg.cpuHigh}/<${cfg.cpuLow} gpu>${cfg.gpuHigh}/<${cfg.gpuLow}, idle>${cfg.idleSec}с, langs=${cfg.langs.join(",")}, cores=${cfg.maxCores}`,
  );
  while (true) {
    await sleep(cfg.intervalSec * 1000);
    // если пульт запущен заново — выходим
    if (readVoxAutoPid() !== process.pid) break;
    const cpu = getCpuLoad();
    const gpu = getGpuLoad();
    const inputSec = getLastInputSeconds();
    const inputActive = inputSec !== null && inputSec < 15; // движение мыши/клавиатура за 15с
    const cpuBusy = cpu !== null && cpu >= cfg.cpuHigh;
    const gpuBusy = gpu.util !== null && gpu.util >= cfg.gpuHigh;
    const busy = inputActive || cpuBusy || gpuBusy;
    if (busy) {
      idleSince = Date.now();
      if (busySince === 0) busySince = Date.now();
      // если занят дольше ~10с и не на паузе — ставим на паузу (реактивнее при вводе)
      const anyRunning = cfg.langs.some((lang) => findWorkers(lang).length && !pauseState(lang));
      if (anyRunning && Date.now() - busySince > 10_000) {
        console.log(
          `[vox-auto] пауза (input=${inputSec?.toFixed(1) ?? "?"}с cpu=${cpu ?? "?"}% gpu=${gpu.util ?? "?"}%)`,
        );
        pauseAllVoxLangs(cfg.langs);
        lowerVoxPriority(cfg);
        busySince = Date.now();
      }
    } else {
      busySince = 0;
      const idleSec = (Date.now() - idleSince) / 1000;
      if (idleSec >= cfg.idleSec) {
        // снимаем с паузы если на паузе
        if (cfg.langs.some((lang) => pauseState(lang))) {
          console.log(
            `[vox-auto] возобновление (простой ${Math.round(idleSec)}с, input=${inputSec?.toFixed(0) ?? "?"}с, cpu=${cpu ?? "?"}% gpu=${gpu.util ?? "?"}%)`,
          );
          resumeAllVoxLangs(cfg.langs);
          await sleep(2000);
          lowerVoxPriority(cfg);
          idleSince = Date.now();
          continue;
        }
        // если остановлены совсем — можно запустить? не делаем автоматически, только пауза/возобновление
      }
    }
    lowerVoxPriority(cfg);
  }
  try {
    rmSync(VOX_AUTO_PID, { force: true });
  } catch {}
}

function cmdVoxAuto(args: string[]): number {
  if (!isWin()) {
    console.log("vox-auto: только Windows");
    return 1;
  }
  const sub = args[0] || "status";
  if (sub === "start") {
    const cur = readVoxAutoPid();
    if (cur) {
      console.log(`vox-auto: уже работает (pid ${cur})`);
      return 0;
    }
    const cfg = getVoxAutoCfg();
    saveVoxAutoCfg(cfg);
    const p = spawn(process.execPath, [join(SCRIPTS_DIR, "voice_ctl.mts"), "__vox_auto_loop"], {
      cwd: ROOT,
      stdio: "ignore",
      detached: true,
      windowsHide: true,
    });
    if (p.pid) p.unref();
    console.log(`vox-auto: запущен (pid ${p.pid}) для ${cfg.langs.join(",")}`);
    console.log(
      `конфиг: output/voice/vox_auto.json (cpuHigh=${cfg.cpuHigh} cpuLow=${cfg.cpuLow} gpuHigh=${cfg.gpuHigh} gpuLow=${cfg.gpuLow} idleSec=${cfg.idleSec})`,
    );
    return 0;
  }
  if (sub === "stop") {
    if (killVoxAuto()) console.log("vox-auto: остановлен");
    else console.log("vox-auto: не запущен");
    return 0;
  }
  if (sub === "status" || sub === "info") {
    const pid = readVoxAutoPid();
    const cfg = getVoxAutoCfg();
    console.log(`vox-auto: ${pid ? "RUNNING pid " + pid : "STOPPED"}`);
    console.log(
      `конфиг: cpu>${cfg.cpuHigh}/<${cfg.cpuLow} gpu>${cfg.gpuHigh}/<${cfg.gpuLow} idle>${cfg.idleSec}с langs=${cfg.langs.join(",")}`,
    );
    console.log(`метрики: cpu=${getCpuLoad() ?? "?"}% gpu=${getGpuLoad().util ?? "?"}%`);
    return 0;
  }
  console.log("usage: vox-auto start|stop|status");
  return 1;
}

function cmdLogs(a: CtlArgs): number {
  const langs = normLangs(a.lang);
  for (const lang of langs) {
    console.log(`=== лог ${lang.toUpperCase()} (последние ${a.n}) ===`);
    try {
      const lines = readLog(lang).split(/\r?\n/);
      for (const line of lines.slice(-a.n)) console.log(line.replace(/\r$/, ""));
    } catch {
      console.log("(нет лога)");
    }
  }
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  let a: CtlArgs;
  try {
    a = parseCtlCli(argv);
  } catch (e) {
    if (e instanceof Error && e.message === "HELP") {
      console.log(CTL_HELP);
      return 0;
    }
    console.error(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  try {
    switch (a.cmd) {
      case undefined:
        return cmdStatus({ ...a, lang: a.lang ?? "all" });
      case "status":
        return cmdStatus(a);
      case "start":
        return await cmdStart(a);
      case "stop":
        return await cmdStop(a);
      case "soft-stop":
        return await cmdSoftStop(a);
      case "pause":
        return await cmdPause(a);
      case "resume":
        return await cmdResume(a);
      case "watch":
        return await cmdWatch(a);
      case "logs":
        return cmdLogs(a);
      case "lower":
      case "lower-priority":
      case "vox-lower":
        return cmdLowerPriority();
      case "vox-auto":
        return cmdVoxAuto(argv.slice(1));
      case "__vox_auto_loop":
        await voxAutoLoop();
        return 0;
      case "vox-start":
        return await cmdStart(a);
      case "vox-stop":
        return await cmdStop(a);
      case "vox-pause":
        return await cmdPause(a);
      case "vox-resume":
        return await cmdResume(a);
      default:
        console.log(CTL_HELP);
        return 1;
    }
  } catch (e) {
    console.log(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

// Запуск только напрямую (импорт в тестах не исполняет пульт).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
