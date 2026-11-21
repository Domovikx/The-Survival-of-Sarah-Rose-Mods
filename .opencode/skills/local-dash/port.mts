/**
 * Порт пульта: проверка занятости, поиск слушающего процесса и его остановка.
 *
 * Зачем: `npm run dash:open` раньше падал с EADDRINUSE, если пульт уже был
 * запущен (или висел после перезагрузки вкладки). Теперь команда сама
 * перезапускает СВОЙ пульт; чужое приложение на порту не трогаем — только
 * сообщаем и предлагаем `--port`.
 */
import { execFileSync } from "node:child_process";
import { connect } from "node:net";

/** Признак нашего пульта в ответе `/api/state` (а не «что-то на порту»). */
export const isDashPayload = (data: unknown): boolean => {
  const o = data as Record<string, unknown> | null;
  return Boolean(
    o && typeof o === "object" && typeof o.v === "number" && typeof o.system === "object" && Array.isArray(o.languages),
  );
};

/**
 * PID-ы, слушающие порт, из вывода `netstat -ano`.
 * Формат строки: `TCP  127.0.0.1:8087  0.0.0.0:0  LISTENING  1234`.
 */
export const parseNetstat = (output: string, port: number): number[] => {
  const pids = new Set<number>();
  for (const line of output.split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue;
    const cells = line.trim().split(/\s+/);
    const local = cells[1] ?? "";
    if (!local.endsWith(`:${port}`)) continue;
    const pid = Number(cells.at(-1));
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
};

/**
 * PID-ы из вывода `Get-NetTCPConnection` в формате «состояние pid».
 *
 * netstat тут ненадёжен: на этой машине он показывал живой сервер строкой
 * `CLOSED` (и не показывал `LISTENING` вовсе), из-за чего пульт принимал себя
 * за «чужое приложение» (поймано 2026-11-21). Берём всё, кроме TIME_WAIT.
 */
export const parseNetTcp = (output: string): number[] => {
  const pids = new Set<number>();
  for (const line of output.split(/\r?\n/)) {
    const cells = line.trim().split(/\s+/);
    const pid = Number(cells.at(-1));
    // Бывает строка без состояния (PowerShell отдал пустой State) — тогда
    // единственный токен это PID, и он наш.
    const state = cells.length > 1 ? (cells[0] ?? "") : "";
    if (!Number.isInteger(pid) || pid <= 0) continue;
    if (/^(TimeWait|Closed|DeleteTCB)$/i.test(state)) continue;
    pids.add(pid);
  }
  return [...pids];
};

/** Кто слушает порт прямо сейчас (Windows). */
export const listenerPids = (port: number): number[] => {
  if (process.platform === "win32") {
    try {
      const out = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ` +
            `Where-Object { $_.OwningProcess -gt 0 } | ` +
            `ForEach-Object { "{0} {1}" -f $_.State, $_.OwningProcess }`,
        ],
        { encoding: "utf-8", timeout: 8000 },
      );
      const pids = parseNetTcp(out);
      if (pids.length) return pids;
    } catch {
      /* PowerShell недоступен — ниже попробуем netstat */
    }
  }
  try {
    return parseNetstat(execFileSync("netstat", ["-ano"], { encoding: "utf-8" }), port);
  } catch {
    return [];
  }
};

/** Порт занят (кто угодно). */
export const portBusy = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
  });

/**
 * Наш ли пульт отвечает на порту (по содержимому `/api/state`).
 * Таймаут щедрый: на холодном старте первый ответ считает po-статистику по
 * 10 языкам и легко выходит за секунду — короткий таймаут давал ложное
 * «порт занят другим приложением» (поймано 2026-11-21).
 */
export const isDashUp = async (port: number): Promise<boolean> => {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/state`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    return isDashPayload(await res.json());
  } catch {
    return false;
  }
};

/** Убить процессы (Windows); молча игнорируем уже завершённые. */
export const killPids = (pids: readonly number[]): void => {
  for (const pid of pids) {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/F"], { stdio: "ignore" });
    } catch {
      /* уже нет — и хорошо */
    }
  }
};

/** Дождаться, пока порт освободится (после kill). */
export const waitPortFree = async (port: number, timeoutMs = 5000): Promise<boolean> => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (!(await portBusy(port))) return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return !(await portBusy(port));
};

/** Командная строка процесса (Windows) — нужна, чтобы узнать, НАШ ли он. */
export const commandLine = (pid: number): string => {
  if (process.platform !== "win32") return "";
  try {
    return execFileSync(
      "powershell",
      ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`],
      { encoding: "utf-8", timeout: 4000 },
    );
  } catch {
    return "";
  }
};

/**
 * Наш ли процесс слушает порт: даже если HTTP ещё не отвечает (холодный
 * старт или зависший запрос), командная строка выдаёт `dashboard.mts`.
 */
export const isDashProcess = (pid: number): boolean => /local-dash[\\/]dashboard\.mts/i.test(commandLine(pid));
