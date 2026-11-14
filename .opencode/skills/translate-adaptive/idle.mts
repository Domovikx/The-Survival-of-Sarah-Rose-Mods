/**
 * idle.mts — простой пользователя (время с последнего ввода с клавиатуры/мыши).
 *
 * Источник — Windows `GetLastInputInfo` (win.ps1 -Cmd idle): это ровно то, что
 * показывает «Время простоя» в диспетчере задач. Порог «отошёл» — минуты,
 * поэтому точность до секунды не нужна, но важно, что детектор не зависит от
 * локального языка вывода (`query user` локализован — не годится) и от того,
 * какое окно в фокусе.
 *
 * Тестируется через подменяемый раннер (deps.run) — юнит-тесты не запускают
 * PowerShell.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const WIN_PS1 = join(HERE, "win.ps1");

/** Разбор вывода `win.ps1 -Cmd idle`: `IDLE_MS=12345` -> 12345 мс. */
export function parseIdleMs(stdout: string): number | null {
  const m = /IDLE_MS=(-?\d+)/.exec(stdout);
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
}

/** Приоритет процесса из `win.ps1 -Cmd stats` (null = процесса нет). */
export function parsePrio(stdout: string): string | null {
  const s = stdout.trim();
  if (!s || s === "null") return null;
  try {
    const j = JSON.parse(s) as { prio?: string };
    return typeof j.prio === "string" ? j.prio : null;
  } catch {
    return null;
  }
}

export interface IdleDeps {
  /** Раннер PowerShell (для тестов). Возвращает stdout. */
  run?: (args: string[]) => string;
}

/** Сколько секунд владелец не прикасался к вводу. null = не смогли узнать. */
export function readIdleSeconds(deps: IdleDeps = {}): number | null {
  // Тестовый хук (E2E переключения профиля без реального «ухода» владельца):
  // TSSR_IDLE_SEC=1200 заставляет думать, что простой 20 минут. В обычной
  // работе переменная не выставляется.
  const override = process.env.TSSR_IDLE_SEC;
  if (override !== undefined && override !== "") {
    const v = Number(override);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  if (process.platform !== "win32") return null;
  const ms = readIdleMs(deps);
  return ms === null ? null : ms / 1000;
}

export function readIdleMs(deps: IdleDeps = {}): number | null {
  const run =
    deps.run ??
    ((args: string[]): string =>
      execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", WIN_PS1, ...args], {
        encoding: "utf-8",
        timeout: 20_000,
        windowsHide: true,
      }));
  try {
    return parseIdleMs(run(["-Cmd", "idle"]));
  } catch {
    return null; // нет PowerShell/не интерактивная сессия — «неизвестно»
  }
}

/** Человеческое «3 ч 12 мин» для статуса. */
export function humanDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} д ${h} ч`;
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин`;
  return `${s} с`;
}
