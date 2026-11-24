/**
 * voice_resume.mts — идемпотентный запуск озвучки: сторож + автокоммит.
 *
 * Зачем: запуск нужен и по расписанию, и руками, и после ребута. Двойной
 * запуск опасен — два сторожа начнут перезапускать батчи друг друга. Поэтому
 * сначала проверяем, не работают ли уже, и только потом стартуем.
 *
 *   npm run voice:resume                                  # поднять (если ещё не поднято)
 *   npm run voice:resume:stop                             # погасить оба демона
 *   node scripts/voice_resume.mts --dry                    # показать план
 *   node scripts/voice_resume.mts --not-before 23:00       # не раньше времени
 *   node scripts/voice_resume.mts --min-free-vram 9000     # не стартовать, если GPU занят
 *
 * Планировщик дёргает этот скрипт каждые 10 минут с `--not-before 23:00`:
 * первый тик после 23:00 стартует, если VRAM свободна, иначе ждёт следующего.
 */
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GUARD = join(ROOT, ".opencode", "skills", "tssr-voice-status", "voice_adaptive.mts");
const AUTO = join(ROOT, ".opencode", "skills", "tssr-voice-status", "voice_autocommit.mts");
const LOG = join(ROOT, "tmp", "voice_resume.log");

/** PID-ы node-процессов по маркеру в командной строке. */
export const pidsWith = (marker: string): number[] => {
  try {
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ` +
          `Where-Object { $_.CommandLine -match '${marker}' } | ForEach-Object { $_.ProcessId }`,
      ],
      { encoding: "utf-8", timeout: 8000 },
    );
    return out
      .split(/\s+/)
      .map(Number)
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
};

/** Свободная VRAM, МиБ (null — nvidia-smi недоступен). */
export const freeVramMb = (): number | null => {
  try {
    const out = execFileSync("nvidia-smi", ["--query-gpu=memory.free", "--format=csv,noheader,nounits"], {
      encoding: "utf-8",
      timeout: 4000,
    }).trim();
    const first = out.split(/\r?\n/)[0] ?? "";
    const mb = Number(first.trim());
    return Number.isFinite(mb) ? mb : null;
  } catch {
    return null;
  }
};

/** Минуты до HH:MM (0 — время наступило). */
export const minutesUntil = (hhmm: string, now = new Date()): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return 0;
  const target = new Date(now);
  target.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return Math.max(0, Math.round((target.getTime() - now.getTime()) / 60_000));
};

const log = (text: string): void => {
  const line = `${new Date().toISOString().slice(0, 19).replace("T", " ")}  ${text}`;
  console.log(line);
  try {
    mkdirSync(dirname(LOG), { recursive: true });
    appendFileSync(LOG, `${line}\n`, "utf-8");
  } catch {
    /* лог не критичен */
  }
};

/**
 * Значение флага из argv поверх дефолта. Раньше «докидывали» флаги в конец —
 * и `parseArgs` брал ПЕРВОЕ вхождение, поэтому `--idle 0` игнорировался
 * (сторож стартовал в экономном режиме). Теперь подставляем значение сразу.
 */
const pick = (argv: string[], name: string, fallback: string): string => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
};

const launch = (script: string, args: string[]): void => {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
};

const main = (): number => {
  const argv = process.argv.slice(2);
  const dry = argv.includes("--dry");
  const stop = argv.includes("--stop");

  const guards = pidsWith("voice_adaptive");
  const autos = pidsWith("voice_autocommit");

  if (stop) {
    for (const pid of [...guards, ...autos]) {
      if (dry) continue;
      try {
        execFileSync("taskkill", ["/PID", String(pid), "/F"], { stdio: "ignore" });
      } catch {
        /* уже нет */
      }
    }
    log(`остановлено: сторож ${guards.length}, автокоммит ${autos.length}`);
    return 0;
  }

  // «Не раньше HH:MM»: планировщик дёргает каждые 10 минут, а стартовать
  // нужно строго после назначенного времени.
  const nbIndex = argv.indexOf("--not-before");
  if (nbIndex >= 0) {
    const nb = argv[nbIndex + 1] ?? "";
    const left = minutesUntil(nb);
    if (left > 0) {
      log(`рано: до ${nb} ещё ${left} мин — выхожу`);
      return 0;
    }
  }

  // Чужой процесс может держать GPU (другой агент): без запаса VRAM не стартуем,
  // иначе два хозяина на 16 ГБ уронят оба.
  const minIndex = argv.indexOf("--min-free-vram");
  const minFree = minIndex >= 0 ? Number(argv[minIndex + 1]) || 0 : 9000;
  if (!guards.length && !dry) {
    const free = freeVramMb();
    if (free !== null && free < minFree) {
      log(`VRAM занята: свободно ${free} МиБ < ${minFree} — ждём следующий тик`);
      return 2;
    }
  }

  const guardArgs = [
    "--lang",
    pick(argv, "--lang", "en"),
    "--idle",
    pick(argv, "--idle", "900"),
    "--poll",
    "60",
    "--full",
    pick(argv, "--full", "2"),
    "--max-temp",
    pick(argv, "--max-temp", "82"),
    "--max-vram",
    pick(argv, "--max-vram", "99"),
  ];

  if (guards.length) log(`сторож уже работает (pid ${guards.join(", ")}) — не трогаю`);
  else if (dry) log(`[dry] запустил бы сторож: ${guardArgs.join(" ")}`);
  else {
    launch(GUARD, guardArgs);
    log("сторож запущен (detached)");
  }

  if (autos.length) log(`автокоммит уже работает (pid ${autos.join(", ")}) — не трогаю`);
  else if (dry) log("[dry] запустил бы автокоммит --every 30 --push");
  else {
    launch(AUTO, ["--every", "30", "--push"]);
    log("автокоммит запущен (detached, каждые 30 мин с пушем)");
  }
  return 0;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
