/**
 * tssr_start_all.mts — идемпотентный запуск фонового контура TSSR.
 *
 * Запускает ТОЛЬКО то, чего не хватает: страж здоровья, сторож слотов,
 * пульт, очередь переводов. Повторный запуск не создаёт дублей (а дубли
 * опасны: две очереди пишут один po, второй страж гасит прогон первого).
 *
 * Окна не показываются (detached + windowsHide), поэтому запускать лучше через
 * scripts/tssr_start_all.vbs (двойной клик) — тот же скрипт без консоли.
 *
 * Остановить всё: scripts/tssr_stop_all.cmd
 */
import { spawn, spawnSync } from "node:child_process";

const COMPONENTS: Array<{ name: string; match: RegExp; args: string[] }> = [
  {
    name: "страж здоровья",
    match: /health_guard/,
    args: ["--experimental-strip-types", "scripts/health_guard.mts", "--interval", "15"],
  },
  {
    name: "сторож слотов",
    match: /np_switch/,
    args: [
      "--experimental-strip-types",
      "scripts/np_switch.mts",
      "--idle-min",
      "15",
      "--away-np",
      "8",
      "--here-np",
      "4",
    ],
  },
  { name: "пульт", match: /dashboard\.mts/, args: [".opencode/skills/local-dash/dashboard.mts"] },
  {
    name: "очередь переводов",
    match: /translate_queue/,
    args: [".opencode/skills/translate/translate_queue.mts"],
  },
];

/** Командные строки всех node-процессов (одним вызовом PowerShell). */
const commandLines = (): string[] => {
  const r = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { $_.CommandLine }",
    ],
    { encoding: "utf-8", timeout: 30_000, windowsHide: true },
  );
  return String(r.stdout ?? "")
    .split(/\r?\n/)
    .filter(Boolean);
};

const lines = commandLines();
let started = 0;
let alive = 0;

for (const c of COMPONENTS) {
  if (lines.some((l) => c.match.test(l))) {
    alive++;
    console.log(`уже работает: ${c.name}`);
    continue;
  }
  const child = spawn(process.execPath, c.args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  started++;
  console.log(`запущен: ${c.name} (pid ${child.pid ?? "?"})`);
}

console.log(`итог: запущено ${started}, уже работало ${alive}. Пульт: http://127.0.0.1:8087`);
