/**
 * voice_resume.mts — идемпотентный запуск озвучки: сторож + автокоммит.
 *
 * Зачем: запуск нужен и по расписанию, и руками, и после ребута. Двойной
 * запуск опасен — два сторожа начнут перезапускать батчи друг друга. Поэтому
 * сначала проверяем, не работают ли уже, и только потом стартуем.
 *
 *   node scripts/voice_resume.mts          # поднять (если ещё не поднято)
 *   node scripts/voice_resume.mts --dry    # показать, что будет сделано
 *   node scripts/voice_resume.mts --stop   # остановить всё (сторож + автокоммит)
 *
 * Флаги прокидываются в сторож: --lang, --idle, --full, --max-temp, --max-vram.
 */
import { execFileSync, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GUARD = join(ROOT, ".opencode", "skills", "tssr-voice-status", "voice_adaptive.mts");
const AUTO = join(ROOT, ".opencode", "skills", "tssr-voice-status", "voice_autocommit.mts");

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

const forward = (argv: string[], names: string[]): string[] => {
  const out: string[] = [];
  for (const name of names) {
    const i = argv.indexOf(name);
    if (i >= 0 && argv[i + 1]) out.push(name, argv[i + 1]!);
  }
  return out;
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
    console.log(`остановлено: сторож ${guards.length}, автокоммит ${autos.length}`);
    return 0;
  }

  const guardArgs = [
    "--lang",
    "en",
    "--idle",
    "900",
    "--poll",
    "60",
    "--full",
    "2",
    "--max-temp",
    "82",
    "--max-vram",
    "99",
    ...forward(argv, ["--lang", "--idle", "--full", "--max-temp", "--max-vram"]),
  ];

  if (guards.length) console.log(`сторож уже работает (pid ${guards.join(", ")}) — не трогаю`);
  else if (dry) console.log(`[dry] запустил бы сторож: ${guardArgs.join(" ")}`);
  else {
    launch(GUARD, guardArgs);
    console.log("сторож запущен (detached)");
  }

  if (autos.length) console.log(`автокоммит уже работает (pid ${autos.join(", ")}) — не трогаю`);
  else if (dry) console.log("[dry] запустил бы автокоммит --every 30 --push");
  else {
    launch(AUTO, ["--every", "30", "--push"]);
    console.log("автокоммит запущен (detached, каждые 30 мин с пушем)");
  }
  return 0;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
