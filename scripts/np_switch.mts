/**
 * np_switch.mts — адаптивное число параллельных слотов llama-server.
 *
 * Назначение. Раннер перевода отправляет до 8 запросов одновременно, поэтому
 * производительность бэкенда ограничена числом слотов `-np`. Днём, когда ПК
 * используется интерактивно, выгоднее умеренный режим (меньше RAM и нагрузки на
 * GPU); при длительном отсутствии пользователя — максимальный.
 *
 * Измерено 2026-11-18 на одной и той же работе (Index-Translate-9B, Q4_K_S):
 *   -np 4 → 151 стр/мин, рабочий набор llama-server ≈ 14 ГБ;
 *   -np 2 → 109 стр/мин, ≈ 6 ГБ;
 *   -np 1 →  60–75 стр/мин, ≈ 6 ГБ.
 * Переключение 4 ↔ 8 меняет скорость примерно пропорционально числу слотов,
 * поэтому режим выбирается по времени простоя пользователя.
 *
 * Механика переключения. Процесс пишет требуемое значение в `tmp/np.txt` и
 * завершает текущий llama-server. Раннер фиксирует недоступность порта в течение
 * 3 минут и завершается; очередь поднимает бэкенд заново, читая `tmp/np.txt`.
 * Такой способ исключает второй экземпляр llama-server: единственным владельцем
 * жизненного цикла бэкенда остаётся очередь переводов.
 *
 * Запуск (в фоне): node --experimental-strip-types scripts/np_switch.mts
 * Параметры: --idle-min 15 (порог простоя, минуты), --away-np 8, --here-np 4.
 * Журнал: tmp/np_switch.log, история режимов: tmp/np_history.csv.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { chooseNp } from "./health_rules.mts";
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
  // История режимов для пульта: позволяет увидеть момент переключения.
  try {
    writeFileSync(HISTORY, `${new Date().toISOString()},${np}\n`, { encoding: "utf-8", flag: "a" });
  } catch {
    /* журнал истории не влияет на работу */
  }
};

// Первое значение тоже попадает в историю, иначе график пуст до переключения.
const START_NP = currentNp() || HERE_NP;
setNp(START_NP);
log(`старт: слотов ${START_NP}`);

for (;;) {
  const idle = idleSeconds();
  const np = currentNp();
  if (idle >= 0) {
    const want = chooseNp(idle, { idleMin: IDLE_MIN, awayNp: AWAY_NP, hereNp: HERE_NP });
    if (want !== np) {
      setNp(want);
      if (backendAlive()) {
        killBackend();
        log(
          `простой ${Math.round(idle / 60)} мин → слотов ${want}: бэкенд остановлен, ` +
            `очередь запустит его с новым значением (около 3 мин)`,
        );
      } else {
        log(`простой ${Math.round(idle / 60)} мин → слотов ${want} (бэкенд не запущен)`);
      }
    }
  }
  // Ожидание без нагрузки на CPU: Atomics.wait блокирует поток, а не опрашивает.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60_000);
}
