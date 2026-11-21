/**
 * Сторож генерации озвучки: следит, что прогон ЖИВ и ДВИГАЕТСЯ, и чинит его.
 *
 *   • процесс умер → поднимаем заново (прогон resumable, продолжит с места);
 *   • прогресс не растёт N проверок подряд → пишем STALL и перезапускаем
 *     (зависший шим на GPU — известный сценарий; лучше перезапуск, чем ночь
 *     простоя);
 *   • всё хорошо → строка с дельтой и прогнозом.
 *
 * Запуск:
 *   node .opencode/skills/tssr-voice-status/voice_guard.mts --lang en --minutes 5 --for 60
 *
 * Лог пишется в tmp/voice_guard.log И в stdout (видно в фоновом прогоне).
 */
/* Сторож — последовательный цикл «подожди → проверь → действуй»:
   параллелить проверки бессмысленно, поэтому no-await-in-loop здесь выключен. */
/* eslint-disable no-await-in-loop */
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { countDone } from "../../../patches/ai-voice-pack/tools/generate/scripts/voice_status.mts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ctl = join(root, "patches/ai-voice-pack/tools/generate/scripts/voice_ctl.mts");
const logPath = join(root, "tmp/voice_guard.log");

type Opts = { lang: string; minutes: number; forMinutes: number };

const parse = (argv: string[]): Opts => {
  const get = (flag: string, fallback: number): number => {
    const i = argv.indexOf(flag);
    return i >= 0 ? Number(argv[i + 1]) || fallback : fallback;
  };
  const li = argv.indexOf("--lang");
  return {
    lang: li >= 0 ? (argv[li + 1] ?? "en") : "en",
    minutes: get("--minutes", 5),
    forMinutes: get("--for", 60),
  };
};

const log = (text: string): void => {
  const line = `${new Date().toISOString().slice(11, 19)}  ${text}`;
  console.log(line);
  appendFileSync(logPath, `${line}\n`, "utf-8");
};

/** Статус из пульта: RUNNING/STOPPED + текущая арка и прогресс. */
const status = (lang: string): Promise<{ running: boolean; line: string }> =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [ctl, "status"], { cwd: root });
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.on("close", () => {
      const line = out
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith(`${lang.toUpperCase()}:`));
      resolve({ running: Boolean(line?.includes("RUNNING")), line: line ?? "нет статуса" });
    });
  });

const start = (lang: string): Promise<void> =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [ctl, "vox-start", lang], { cwd: root });
    child.stdout.on("data", (d: Buffer) => log(`vox-start: ${d.toString().trim()}`));
    child.on("close", () => resolve());
  });

const main = async (): Promise<void> => {
  const opts = parse(process.argv.slice(2));
  mkdirSync(dirname(logPath), { recursive: true });
  const ticks = Math.max(1, Math.round(opts.forMinutes / opts.minutes));
  log(`старт: язык ${opts.lang}, проверка каждые ${opts.minutes} мин, всего ${ticks} раз`);

  let prev = countDone(opts.lang).total;
  let stalls = 0;

  for (let i = 1; i <= ticks; i++) {
    await new Promise((r) => setTimeout(r, opts.minutes * 60_000));
    const now = countDone(opts.lang).total;
    const { running, line } = await status(opts.lang);
    const delta = now - prev;
    prev = now;

    if (!running) {
      log(`МЁРТВ (${line}) → перезапуск`);
      await start(opts.lang);
      stalls = 0;
      continue;
    }
    if (delta === 0) {
      stalls += 1;
      log(`СТОП-ПРОГРЕСС (${now}, 0 за ${opts.minutes} мин, подряд ${stalls})`);
      if (stalls >= 3) {
        log("три проверки без движения → перезапуск");
        await start(opts.lang);
        stalls = 0;
      }
      continue;
    }
    stalls = 0;
    const rate = delta / opts.minutes;
    const left = Math.round((68357 - now) / Math.max(0.1, rate) / 60 / 24);
    log(`ок: ${now}/68357 (+${delta}), ${rate.toFixed(1)}/мин, ~${left} сут`);
  }
  log("сторож закончил смену");
};

void main();
