/**
 * vox_queue.mts — ОЧЕРЕДЬ Vox-генерации: обход арок языка через voxcpm_bench
 * с --resume (задача 2026-10-30 «Vox: SB+WarArc на 11 языках», требование
 * владельца: «нужен планировщик чтобы продолжать после обрыва или остановки»).
 *
 * Запуск (из корня репы):
 *   node patches/ai-voice-pack/tools/generate/scripts/vox_queue.mts ru            # 3 стартовые арки
 *   node patches/ai-voice-pack/tools/generate/scripts/vox_queue.mts es WarArc     # одна арка
 *   node patches/ai-voice-pack/tools/generate/scripts/vox_queue.mts de --dry-run  # печать команд
 *   python tools/voice_ctl.py vox-start [lang|all]   # пульт (фоном, ниже приоритет)
 *   python tools/voice_ctl.py vox-stop / vox-pause / vox-resume
 *
 * Свойства:
 *   - RESUME: каждый прогон идёт с `--resume` — готовые opus пропускаются,
 *     убийство/обрыв/ребут не теряют прогресс, повторный запуск продолжает
 *     с места (файлы пишутся атомарно: wav -> .part -> rename);
 *   - арки ПО ПОРЯДКУ, лог append: tools/generate/output/voice/vox_gen_{lang}.log
 *     с маркерами `=== START/DONE lang arc HH:MM ===` — их же парсит
 *     voice_ctl (START_RE/DONE_RE), т.е. статус/пауза/стоп пульта видят очередь;
 *   - ПРОГРЕСС в формате voice_batch: строка `[i/N] vox {arc}` (i включает
 *     пропущенные resume'ом) — parse_progress_line пульта её читает без правок;
 *   - низкий приоритет python-шинов (wmic BelowNormal, как voice_queue.sh);
 *   - конфиг = ПРОЛОГ-конфиг (seed 49, cfg2.6/ts30/dn — вердикт владельца
 *     2026-10-29): тем же звучанием, что уже озвученный пролог;
 *   - Stop: Ctrl+C/kill раннера безопасен (текущая фраза может не дописаться —
 *     её нет в opus, resume перегенерирует).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const GENERATE_DIR = dirname(SCRIPTS_DIR);
const BENCH = join(SCRIPTS_DIR, "voxcpm_bench.mts");

/** Языки игры (11 po-языков): валидация аргумента и `all` в пульте. */
export const VOX_LANGS = ["ru", "en", "de", "es", "fr", "it", "ja", "ko", "pl", "pt", "zh"] as const;
/** Арки по умолчанию — три стартовые из диаграммы ветвления (docs/game-branching.puml). */
export const DEFAULT_ARCS = ["Prologue", "StoryBeginnings", "WarArc"] as const;
/** Конфиг пролога (238x11, коммиты 1bdaa17c0/264dc93ef): им озвучен пролог — им и SB/WarArc. */
export const PROLOGUE_CFG = { seed: 49, cfg: 2.6, ts: 30 } as const;
/** --picks >= размера пула = все фразы арки (selectSample режет Math.min). */
export const PICKS_ALL = "99999";

export interface QueueCli {
  lang: string;
  /** Арки-параметры после языка; пусто = DEFAULT_ARCS. */
  arcs: string[];
  /** Печать команд без запуска (--dry-run). */
  dryRun: boolean;
}

export function parseQueueCli(argv: string[]): QueueCli {
  const dryRun = argv.includes("--dry-run");
  const rest = argv.filter((a) => !a.startsWith("-"));
  const [lang, ...arcs] = rest;
  if (!lang) throw new Error("usage: node vox_queue.mts <lang> [arc...] [--dry-run]");
  if (!(VOX_LANGS as readonly string[]).includes(lang)) {
    throw new Error(`неизвестный язык "${lang}" — доступны: ${VOX_LANGS.join(", ")}`);
  }
  return { lang, arcs: arcs.length > 0 ? arcs : [...DEFAULT_ARCS], dryRun };
}

/** Аргументы запуска стенда для одной арки (конфиг пролога + resume). */
export function benchQueueArgs(lang: string, arc: string): string[] {
  return [
    BENCH,
    "--lang",
    lang,
    "--arc",
    arc,
    "--picks",
    PICKS_ALL,
    "--seed",
    String(PROLOGUE_CFG.seed),
    "--cfg",
    String(PROLOGUE_CFG.cfg),
    "--ts",
    String(PROLOGUE_CFG.ts),
    // denoise=true — прод-дефолт (2026-10-28); ЯВНЫМ --opt шим и корпус пролога
    // одновременно: без него шим денойзит и так (env VOXCPM_DENOISER=1), но имя
    // файла потеряло бы `_dn` и не легло бы рядом с существующим корпусом.
    "--opt",
    "denoise=true",
    "--resume",
  ];
}

/** Прогресс-состояние одного прогона по арке (парсит вывод стенда). */
export interface ProgressState {
  /** Сколько resume уже посчитал готовыми до этого прогона. */
  skipped: number;
  /** Сколько в работе (заголовок стенда `пронов=N` / `в работе N`). */
  remaining: number;
  /** Сколько фраз досгенерировано в ЭТОМ прогоне. */
  done: number;
}

export function progressState(): ProgressState {
  return { skipped: 0, remaining: 0, done: 0 };
}

/**
 * Строка вывода стенда -> новая строка прогресса пульта `[i/N] vox {arc}`
 * (формат PROGRESS_RE voice_ctl) или null. Считаются ТОЛЬКО завершённые
 * фразы (строка результата `..., gen Nс,`); план-листинг и FAIL не в счёт —
 * незавершённая фраза не попала в opus и будет доделана resume'ом.
 */
export function progressLine(line: string, st: ProgressState, arc: string): string | null {
  const skip = /resume: пропущено готовых (\d+), в работе (\d+)/.exec(line);
  if (skip) {
    st.skipped = Number(skip[1]);
    st.remaining = Number(skip[2]);
    if (st.remaining === 0) return `[${st.skipped}/${st.skipped}] vox ${arc}`;
    return null;
  }
  const hdr = /прогонов=(\d+)/.exec(line);
  if (hdr && st.remaining === 0) st.remaining = Number(hdr[1]);
  if (/^ {1,4}\d+\. .*gen /.test(line)) {
    st.done += 1;
    const total = st.skipped + st.remaining;
    if (total > 0) return `[${st.skipped + st.done}/${total}] vox ${arc}`;
  }
  return null;
}

function hm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function logLine(logPath: string, s: string): void {
  appendFileSync(logPath, s + "\n", "utf-8");
  console.log(s);
}

/** Ниже обычного приоритета для python-шинов (зеркало voice_queue.sh; ошибки молча игнорируем). */
function lowerPythonPriority(): void {
  spawnSync("wmic", ["process", "where name='python.exe'", "call", "setpriority", "16384"], {
    windowsHide: true,
    stdio: "ignore",
  });
}

function runArc(lang: string, arc: string, logPath: string): Promise<number> {
  logLine(logPath, `=== START ${lang} ${arc} ${hm()} ===`);
  const st = progressState();
  let done: ((code: number) => void) | null = null;
  const child = spawn(process.execPath, benchQueueArgs(lang, arc), {
    env: { ...process.env, VOXCPM_DENOISER: "1", OMP_NUM_THREADS: process.env.OMP_NUM_THREADS ?? "6" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  currentChild = child;
  lowerPythonPriority();
  // шим стартует после model-load (~секунды) — добиваем приоритет повтором
  const rePriority = setTimeout(lowerPythonPriority, 10_000);
  // Буфер на поток: чанк может рвать строку посередине — прогресс считаем
  // только по целым строкам.
  const makeTee = () => {
    let pending = "";
    return (chunk: Buffer): void => {
      const text = pending + chunk.toString("utf-8");
      const lines = text.split(/\r?\n/);
      pending = lines.pop() ?? "";
      process.stdout.write(text.slice(0, text.length - pending.length));
      appendFileSync(logPath, text.slice(0, text.length - pending.length), "utf-8");
      for (const line of lines) {
        const p = progressLine(line, st, arc);
        if (p) logLine(logPath, p);
      }
    };
  };
  child.stdout.on("data", makeTee());
  child.stderr.on("data", makeTee());
  child.on("close", (code) => {
    clearTimeout(rePriority);
    currentChild = null;
    done?.(code ?? 1);
  });
  child.on("error", (err) => {
    clearTimeout(rePriority);
    currentChild = null;
    logLine(logPath, `ошибка запуска стенда: ${err.message}`);
    done?.(1);
  });
  return new Promise((resolve) => {
    done = resolve;
  });
}

/** Текущий дочерний стенд — для kill-дерева при Ctrl+C/stop. */
let currentChild: ChildProcess | null = null;

function killCurrent(): void {
  if (!currentChild?.pid) return;
  spawnSync("taskkill", ["/PID", String(currentChild.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
}

async function main(argv: string[]): Promise<number> {
  let cli: QueueCli;
  try {
    cli = parseQueueCli(argv);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 2;
  }
  const logDir = join(GENERATE_DIR, "output", "voice");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, `vox_gen_${cli.lang}.log`);
  if (cli.dryRun) {
    for (const arc of cli.arcs) console.log(`node ${benchQueueArgs(cli.lang, arc).join(" ")}`);
    return 0;
  }

  const stop = (sig: string): void => {
    logLine(logPath, `=== STOPPED ${cli.lang} ${sig} ${hm()} ===`);
    killCurrent();
    process.exit(130);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  let failures = 0;
  for (const arc of cli.arcs) {
    // eslint-disable-next-line no-await-in-loop -- последовательно: одна GPU, арка за аркой
    const rc = await runArc(cli.lang, arc, logPath);
    if (rc === 0) logLine(logPath, `=== DONE ${cli.lang} ${arc} ${hm()} ===`);
    else {
      failures += 1;
      logLine(logPath, `=== FAILED ${cli.lang} ${arc} rc=${rc} ${hm()} ===`);
    }
  }
  logLine(logPath, `=== ALL DONE ${cli.lang} ${hm()} ===`);
  if (failures > 0) {
    console.error(`${failures} арка(и) с ошибкой — смотри лог ${logPath}`);
    return 1;
  }
  return 0;
}

// Запуск только напрямую (импорт в тестах не исполняет очередь).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
