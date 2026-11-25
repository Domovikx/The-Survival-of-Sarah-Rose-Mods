/**
 * Адаптивная озвучка: пока владелец за ПК — один воркер (ПК отзывчив),
 * если его нет ≥ N минут — два воркера (полная загрузка GPU).
 *
 * Простой идёт ~4–5 реплик/мин на одном воркере и ~7–8 на двух (замер
 * 2026-11-21: 12 реплик за 209 с против 13 за 154 с без загрузки модели),
 * но два воркера занимают ~15.3 ГБ VRAM из 16.3 — держать их постоянно
 * рядом с играми/браузером рискованно.
 *
 * Запуск:
 *   node .opencode/skills/tssr-voice-status/voice_adaptive.mts
 *   node .opencode/skills/tssr-voice-status/voice_adaptive.mts --idle 900 --lang en
 *
 * Ключи: --lang en, --idle 900 (секунд «нет ввода» до полной загрузки),
 *        --poll 60 (период проверки), --dry (только печатать решение).
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";

import { countDone } from "../../../patches/ai-voice-pack/tools/generate/scripts/voice_status.mts";
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const logPath = join(root, "tmp/voice_adaptive.log");
const stopFlag = join(root, "tmp/voice_adaptive.stop");
const batch = join(root, "patches/ai-voice-pack/tools/generate/scripts/voice_batch.mts");

export type Opts = {
  lang: string;
  idle: number;
  poll: number;
  dry: boolean;
  /** Воркеров в «полном» режиме (на 16 ГБ больше двух не влезает). */
  full: number;
  /** Порог температуры GPU, °C: выше — принудительно экономный режим. */
  maxTemp: number;
  /** Порог занятой VRAM, %: выше — экономный режим (иначе своп и темп в ноль). */
  maxVram: number;
  /** Не запускать генерацию до этого времени (ЧЧ:ММ, локально); null — сразу. */
  startAt: string | null;
};

export const parseArgs = (argv: string[]): Opts => {
  // ВАЖНО: `Number(x) || fallback` съедал ноль (`--idle 0` → 900). Проверяем
  // конечность числа, а не «истинность».
  const num = (flag: string, fallback: number): number => {
    const i = argv.indexOf(flag);
    if (i < 0) return fallback;
    const value = Number(argv[i + 1]);
    return Number.isFinite(value) ? value : fallback;
  };
  const li = argv.indexOf("--lang");
  return {
    lang: li >= 0 ? (argv[li + 1] ?? "en") : "en",
    idle: num("--idle", 900),
    poll: num("--poll", 60),
    dry: argv.includes("--dry"),
    full: Math.max(1, Math.min(4, num("--full", 2))),
    maxTemp: num("--max-temp", 83),
    maxVram: num("--max-vram", 97),
    startAt: argv.includes("--start-at") ? (argv[argv.indexOf("--start-at") + 1] ?? null) : null,
  };
};

/**
 * Сколько воркеров держать при таком простое. Ровно два состояния:
 * владелец вернулся (любой ввод за последние N секунд) — 1, иначе 2.
 */
export const desiredWorkers = (idleSeconds: number, idleThreshold: number): 1 | 2 =>
  idleSeconds >= idleThreshold ? 2 : 1;

/** Секунды с последнего ввода (Windows); -1 — не смогли узнать. */
export const idleSeconds = (): number => {
  if (process.platform !== "win32") return 0;
  const ps = [
    "$sig='[DllImport(\"user32.dll\")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);';",
    "Add-Type -Namespace W -Name U -MemberDefinition ('public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; } ' + $sig);",
    "$i=New-Object W.U+LASTINPUTINFO; $i.cbSize=[Runtime.InteropServices.Marshal]::SizeOf($i);",
    "[void][W.U]::GetLastInputInfo([ref]$i);",
    "[math]::Floor((([uint32][Environment]::TickCount - $i.dwTime) / 1000))",
  ].join(" ");
  try {
    return Number(
      execFileSync("powershell", ["-NoProfile", "-Command", ps], {
        encoding: "utf-8",
        timeout: 5000,
        windowsHide: true,
      }).trim(),
    );
  } catch {
    return -1;
  }
};

/** Здоровье GPU: температура и процент занятой VRAM (null — nvidia-smi недоступен). */
export const gpuHealth = (): { temp: number; vramPct: number } | null => {
  try {
    const out = execFileSync(
      "nvidia-smi",
      ["--query-gpu=temperature.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"],
      { encoding: "utf-8", timeout: 4000, windowsHide: true },
    ).trim();
    const [temp, used, total] = out.split(",").map((x) => Number(x.trim()));
    if (!Number.isFinite(temp!) || !Number.isFinite(used!) || !Number.isFinite(total!) || !total) return null;
    return { temp: temp!, vramPct: Math.round((used! / total!) * 100) };
  } catch {
    return null;
  }
};

/** Ближайшее наступление HH:MM (сегодня или завтра), мс от сейчас. */
export const msUntil = (hhmm: string, now = new Date()): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return 0;
  const target = new Date(now);
  target.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
};

const log = (text: string): void => {
  const line = `${new Date().toISOString().slice(11, 19)}  ${text}`;
  console.log(line);
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${line}\n`, "utf-8");
};

/** Живые voice_batch этого языка, запущенные НЕ нами (пульт/старые прогоны). */
const foreignBatches = (lang: string): number[] => {
  try {
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'voice_batch' } | ForEach-Object { $_.ProcessId }",
      ],
      { encoding: "utf-8", timeout: 5000, windowsHide: true },
    );
    return out
      .split(/\s+/)
      .map(Number)
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    void lang;
    return [];
  }
};

/** Дождаться, пока VRAM освободится (после kill старого батча). */
export const waitVramFree = async (belowPct = 25, timeoutMs = 30_000): Promise<boolean> => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const h = gpuHealth();
    if (!h || h.vramPct < belowPct) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

const startBatch = (opts: Opts, workers: number): ChildProcess => {
  for (const pid of foreignBatches(opts.lang)) {
    if (pid !== process.pid) {
      try {
        execFileSync("taskkill", ["/PID", String(pid), "/F"], { stdio: "ignore", windowsHide: true });
        log(`чужой voice_batch ${pid} остановлен (источник истины — этот сторож)`);
      } catch {
        /* уже нет */
      }
    }
  }
  log(`старт: воркеров ${workers}`);
  // --engine voxcpm2 ОБЯЗАТЕЛЕН: без маркера движка пульт считает процесс
  // легаси-контуром CosyVoice и показывает «STOPPED» при живом прогоне.
  const child = spawn(
    process.execPath,
    [batch, "--engine", "voxcpm2", "--lang", opts.lang, "--workers", String(workers)],
    {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      // Без этого Windows открывает КОНСОЛЬНОЕ ОКНО на каждый батч
      // («окно ноды висит и дергается», 2026-11-25).
      windowsHide: true,
    },
  );
  child.stdout?.on("data", (d: Buffer) => appendFileSync(logPath, d.toString(), "utf-8"));
  child.stderr?.on("data", (d: Buffer) => appendFileSync(logPath, d.toString(), "utf-8"));
  return child;
};

const main = (): void => {
  const opts = parseArgs(process.argv.slice(2));
  if (existsSync(stopFlag)) rmSync(stopFlag, { force: true });
  let workers = 0;
  let child: ChildProcess | null = null;
  let lastStart = 0;
  /** Зависание: процесс жив, а файлы не появляются (шимы иногда залипают). */
  let lastCount = -1;
  let stalledSince = Date.now();
  /**
   * Пауза после отката по здоровью. Без неё режим «мигал»: откат на 1 воркер
   * освобождал VRAM → следующая проверка снова включала 2 → 96 % VRAM → откат,
   * и так каждую минуту (каждое переключение — kill + перезагрузка модели).
   */
  let healthCooldownUntil = 0;

  /** Погасить батч и дождаться, пока GPU освободится. */
  const stopChild = async (): Promise<void> => {
    const c = child;
    child = null;
    workers = 0;
    if (!c || c.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      c.once("exit", () => resolve());
      c.kill();
      setTimeout(resolve, 8000);
    });
    const freed = await waitVramFree();
    log(freed ? "GPU освободилась — можно стартовать" : "VRAM не освободилась за 30 с");
  };

  const quietUntil = opts.startAt ? Date.now() + msUntil(opts.startAt) : 0;

  const tick = async (): Promise<void> => {
    // Тихий режим: до назначенного времени НИЧЕГО не запускаем, даже если
    // владелец отошёл на 15 минут (замечание 2026-11-22).
    if (quietUntil && Date.now() < quietUntil) return;
    if (existsSync(stopFlag)) {
      log("найден tmp/voice_adaptive.stop — останавливаюсь");
      child?.kill();
      rmSync(stopFlag, { force: true });
      process.exit(0);
    }
    if (child && child.exitCode !== null) {
      log(`voice_batch завершился (код ${child.exitCode}) — перезапущу, если очередь не пуста`);
      child = null;
      workers = 0;
      await waitVramFree();
    }
    const idle = idleSeconds();
    let want: number = desiredWorkers(idle < 0 ? 0 : idle, opts.idle) === 2 ? opts.full : 1;

    // Здоровье: перегрев или почти полная VRAM — откатываемся на 1 воркер.
    const h = gpuHealth();
    if (Date.now() < healthCooldownUntil && want > 1) {
      want = 1;
    } else if (h && want > 1 && (h.temp >= opts.maxTemp || h.vramPct >= opts.maxVram)) {
      log(`здоровье: ${h.temp}°C, VRAM ${h.vramPct}% → откат на 1 воркер, 30 мин не пробую 2`);
      want = 1;
      healthCooldownUntil = Date.now() + 30 * 60_000;
    }
    // Раз в 5 минут сверяем прогресс: жив, но не пишет 15 минут → перезапуск.
    if (Date.now() - lastStart > 5 * 60_000) {
      const now = countDone(opts.lang).total;
      if (now !== lastCount) {
        lastCount = now;
        stalledSince = Date.now();
      } else if (child && Date.now() - stalledSince > 15 * 60_000) {
        log(`нет новых файлов 15 мин (всего ${now}) — перезапуск`);
        child.kill();
        child = null;
        workers = 0;
        stalledSince = Date.now();
      }
    }

    if (want !== workers) {
      if (opts.dry) {
        log(`[dry] простой ${idle}s → воркеров ${want} (сейчас ${workers || "нет"})`);
        workers = want;
        return;
      }
      if (Date.now() - lastStart < 30_000) {
        log("слишком частые переключения — жду");
        return;
      }
      await stopChild();
      child = startBatch(opts, want);
      workers = want;
      lastStart = Date.now();
      log(`простой ${idle}s → режим ${want === 2 ? "полный (2)" : "экономный (1)"}`);
    }
  };

  if (opts.startAt) {
    log(`тихий режим: генерация не раньше ${opts.startAt} (через ${Math.round(msUntil(opts.startAt) / 60_000)} мин)`);
  }
  log(`сторож старт: язык ${opts.lang}, порог простоя ${opts.idle}s, опрос ${opts.poll}s`);
  writeFileSync(join(root, "tmp/voice_adaptive.pid"), String(process.pid), "utf-8");
  void tick();
  setInterval(() => void tick(), opts.poll * 1000);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
