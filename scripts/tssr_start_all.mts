/**
 * tssr_start_all.mts — идемпотентный запуск фонового контура TSSR БЕЗ окон.
 *
 * Запускает только недостающее: страж, сторож слотов, пульт, очередь переводов.
 * Повторный запуск дублей не создаёт (две очереди писали бы один po, второй
 * страж гасил бы первый прогон).
 *
 * ПОЧЕМУ ТАК, а не прямым spawn: node, запущенный напрямую (или из VBS), получает
 * консоль, и Windows Terminal — он в системе «терминал по умолчанию» — рисует
 * кнопку на панели задач с заголовком `C:\Program Files\nodejs\node.exe`.
 * Выглядело как «висит окно cmd» (инцидент 2026-11-17).
 *   - spawn(..., {detached, windowsHide}) → окно ВСЁ РАВНО появляется;
 *   - conhost --headless, запущенный обычным spawn → дети умирают вместе с
 *     лаунчером (нет своей консоли-держателя);
 *   - conhost --headless через `Start-Process` → живёт, окна нет (проверено).
 *
 * Остановить всё: scripts\tssr_stop_all.cmd
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const COMPONENTS: Array<{ name: string; match: RegExp; cmd: string }> = [
  {
    name: "страж здоровья",
    match: /health_guard/,
    cmd: "node --experimental-strip-types scripts\\health_guard.mts --interval 15",
  },
  {
    name: "сторож слотов",
    match: /np_switch/,
    cmd: "node --experimental-strip-types scripts\\np_switch.mts --idle-min 15 --away-np 8 --here-np 4",
  },
  { name: "пульт", match: /dashboard\.mts/, cmd: "node .opencode\\skills\\local-dash\\dashboard.mts" },
  {
    name: "очередь переводов",
    match: /translate_queue/,
    cmd: "node .opencode\\skills\\translate\\translate_queue.mts",
  },
];

/** Живые node-процессы (одним вызовом PowerShell). */
const commandLines = (): string => {
  const r = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { $_.CommandLine }",
    ],
    { encoding: "utf-8", timeout: 30_000, windowsHide: true },
  );
  return String(r.stdout ?? "");
};

const lines = commandLines();
let started = 0;
let alive = 0;

for (const c of COMPONENTS) {
  if (c.match.test(lines)) {
    alive++;
    console.log(`уже работает: ${c.name}`);
    continue;
  }
  // conhost --headless через Start-Process: консоль есть, окна нет, процессы живут
  // после выхода лаунчера.
  const arg = `--headless cmd /c "cd /d ${REPO} && ${c.cmd}"`;
  const r = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", `Start-Process -FilePath 'conhost.exe' -ArgumentList '${arg}' -WindowStyle Hidden`],
    { encoding: "utf-8", timeout: 30_000, windowsHide: true },
  );
  if (r.status === 0) {
    started++;
    console.log(`запущен: ${c.name}`);
  } else {
    console.log(`ОШИБКА запуска: ${c.name}: ${(r.stderr ?? "").trim().slice(0, 120)}`);
  }
}

console.log(`итог: запущено ${started}, уже работало ${alive}. Пульт: http://127.0.0.1:8087`);
