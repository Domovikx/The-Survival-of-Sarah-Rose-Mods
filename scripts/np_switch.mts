/**
 * np_switch.mts — подстраивает число параллельных слотов llama-server под
 * присутствие человека за ПК.
 *
 * Логика (владелец 2026-11-17): «можешь вообще 8 делать, если меня за ПК нету
 * больше 15 минут». Раннер гонит 8 воркеров, поэтому -np упирается в скорость:
 *   -np 4 → ~151 стр/мин (проверено), -np 8 → больше, но RAM/питание злее.
 *
 * Как переключаем БЕЗ второго llama-server: пишем желаемое значение в
 * `tmp/np.txt` и гасим бэкенд. Раннер через 3 минуты молчания порта выходит,
 * очередь перезапускает llama-server, читая `tmp/np.txt`. Дублирования аргументов
 * запуска нет — единственный владелец бэкенда остаётся очередь.
 *
 * Запуск (скрыто): node --experimental-strip-types scripts/np_switch.mts
 * Настройки: --idle-min 15 (порог простоя, мин), --away-np 8, --here-np 4.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const num = (flag: string, def: number): number => {
  const i = args.indexOf(flag);
  if (i < 0) return def;
  const v = Number(args[i + 1]);
  return Number.isFinite(v) ? v : def;
};
const IDLE_MIN = num("--idle-min", 15);
const AWAY_NP = num("--away-np", 8);
const HERE_NP = num("--here-np", 4);
const FILE = join("tmp", "np.txt");
const LOG = join("tmp", "np_switch.log");
const HISTORY = join("tmp", "np_history.csv");

const log = (m: string): void => {
  const line = `${new Date().toISOString()} ${m}`;
  console.log(line);
  try {
    writeFileSync(LOG, `${line}\n`, { encoding: "utf-8", flag: "a" });
  } catch {
    /* лог не критичен */
  }
};

/** Простой пользователя в секундах (GetLastInputInfo). */
const idleSeconds = (): number => {
  const ps = [
    "-NoProfile",
    "-Command",
    'Add-Type -TypeDefinition \'using System;using System.Runtime.InteropServices;public struct LASTINPUTINFO{public uint cbSize;public uint dwTime;}public class Idle{[DllImport("user32.dll")]static extern bool GetLastInputInfo(ref LASTINPUTINFO p);[DllImport("kernel32.dll")]static extern uint GetTickCount();public static uint Sec(){var l=new LASTINPUTINFO();l.cbSize=(uint)System.Runtime.InteropServices.Marshal.SizeOf(l);GetLastInputInfo(ref l);return (GetTickCount()-l.dwTime)/1000;}}\'; [Idle]::Sec()',
  ];
  const r = spawnSync("powershell", ps, { encoding: "utf-8", timeout: 15_000, windowsHide: true });
  const n = Number.parseInt(String(r.stdout ?? "").trim(), 10);
  return Number.isFinite(n) ? n : -1;
};

const backendAlive = (): boolean => {
  const r = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", "@(Get-CimInstance Win32_Process -Filter \"Name='llama-server.exe'\").Count"],
    { encoding: "utf-8", timeout: 15_000, windowsHide: true },
  );
  return Number.parseInt(String(r.stdout ?? "").trim(), 10) > 0;
};

const killBackend = (): void => {
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Get-Process llama-server -ErrorAction SilentlyContinue | Stop-Process -Force; 'killed'",
    ],
    { encoding: "utf-8", timeout: 20_000, windowsHide: true },
  );
};

const currentNp = (): number => {
  try {
    const v = Number.parseInt(readFileSync(FILE, "utf-8").trim(), 10);
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
};

const setNp = (np: number): void => {
  writeFileSync(FILE, `${np}\n`, "utf-8");
  // История шагов для пульта: видно, когда режим менялся (4 днём / 8 когда отошёл).
  try {
    writeFileSync(HISTORY, `${new Date().toISOString()},${np}\n`, { encoding: "utf-8", flag: "a" });
  } catch {
    /* история не критична */
  }
};

// Стартовый шаг тоже пишем в историю: иначе график пуст до первого переключения.
const START_NP = currentNp() || HERE_NP;
setNp(START_NP);
log(`старт: слотов ${START_NP}`);

log(`слежение: простой > ${IDLE_MIN} мин → ${AWAY_NP} слотов, вернулся → ${HERE_NP}`);

for (;;) {
  const idle = idleSeconds();
  const np = currentNp();
  if (idle >= 0) {
    const want = idle >= IDLE_MIN * 60 ? AWAY_NP : HERE_NP;
    if (want !== np) {
      setNp(want);
      if (backendAlive()) {
        killBackend();
        log(
          `простой ${Math.round(idle / 60)} мин → слотов ${want}: бэкенд погашен, ` +
            `очередь поднимет его с новым значением (~3 мин)`,
        );
      } else {
        log(`простой ${Math.round(idle / 60)} мин → слотов ${want} (бэкенд и так лежит)`);
      }
    }
  }
  // Усыпляем процесс без нагрузки: Atomics.wait не жжёт CPU.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60_000);
}
