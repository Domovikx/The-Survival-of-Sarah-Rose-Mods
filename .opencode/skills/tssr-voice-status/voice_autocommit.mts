/**
 * Автокоммит корпуса озвучки: когда накопилось N новых файлов — коммит.
 *
 * Зачем: полный прогон EN идёт сутками и пишет файлы постоянно; коммитить
 * каждый файл — шум, а раз в неделю — терять историю. Порог 500 даёт
 * спокойные порции и при этом видимый прогресс в git.
 *
 * Сообщение коммита — простая статистика по языку: сколько всего готово из
 * плана и сколько осталось (владелец 2026-11-21).
 *
 * Запуск:
 *   node .opencode/skills/tssr-voice-status/voice_autocommit.mts --once
 *   node .opencode/skills/tssr-voice-status/voice_autocommit.mts --every 30
 *
 * Ключи: --lang en (по умолчанию), --min 500, --dry (только показать),
 *        --push (после коммита отправить в origin).
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { countDone, plan } from "../../../patches/ai-voice-pack/tools/generate/scripts/voice_status.mts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const logPath = join(root, "tmp/voice_autocommit.log");

type Opts = { lang: string; min: number; every: number | null; dry: boolean; push: boolean };

export const parseArgs = (argv: string[]): Opts => {
  const num = (flag: string, fallback: number): number => {
    const i = argv.indexOf(flag);
    return i >= 0 ? Number(argv[i + 1]) || fallback : fallback;
  };
  const li = argv.indexOf("--lang");
  return {
    lang: li >= 0 ? (argv[li + 1] ?? "en") : "en",
    min: num("--min", 500),
    every: argv.includes("--every") ? num("--every", 30) : null,
    dry: argv.includes("--dry"),
    push: argv.includes("--push"),
  };
};

/** Сколько реплик в плане языка (все озвучиваемые строки). */
export const planTotal = (lang: string): number => [...plan(lang).values()].reduce((sum, n) => sum + n, 0);

const PLANS = new Map<string, number>();
/** План кэшируется: чтение POT на каждом тике — лишние секунды. */
const totalOf = (lang: string): number => {
  const cached = PLANS.get(lang);
  if (cached !== undefined) return cached;
  const total = planTotal(lang);
  PLANS.set(lang, total);
  return total;
};

/** Текст коммита: кратко, с готовым/остатком (без списков файлов). */
export const commitMessage = (lang: string, added: number, done: number, total: number): string => {
  const left = Math.max(0, total - done);
  const pct = total > 0 ? ((done / total) * 100).toFixed(1) : "0.0";
  return `feat(voice): ${lang.toUpperCase()} +${added} реплик — ${done} / ${total} (${pct}%), осталось ${left}`;
};

/** Сколько НОВЫХ (untracked) файлов корпуса лежит в рабочем дереве. */
export const newCorpusFiles = (lang: string): string[] => {
  const out = execFileSync("git", ["status", "--porcelain", "-z", "--", `patches/ai-voice-pack/audio/${lang}`], {
    cwd: root,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split("\0")
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3))
    .filter((path) => path.endsWith(".opus"));
};

const git = (args: string[]): string =>
  execFileSync("git", args, { cwd: root, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });

const log = (text: string): void => {
  const line = `${new Date().toISOString().slice(0, 19).replace("T", " ")}  ${text}`;
  console.log(line);
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${line}\n`, "utf-8");
};

/** Одна проверка: если новых файлов >= порога — коммит. Возвращает коммитили ли. */
export const tick = (opts: Opts): boolean => {
  const files = newCorpusFiles(opts.lang);
  if (files.length < opts.min) {
    log(`${opts.lang}: новых ${files.length} — меньше порога ${opts.min}, ждём`);
    return false;
  }
  // Чужой коммит/merge в процессе — не лезем.
  if (existsSync(join(root, ".git/index.lock"))) {
    log(`${opts.lang}: .git/index.lock занят — пропускаю тик`);
    return false;
  }

  const done = countDone(opts.lang).total;
  const total = totalOf(opts.lang);
  const message = commitMessage(opts.lang, files.length, done, total);
  if (opts.dry) {
    log(`${opts.lang}: [dry] ${files.length} файлов → «${message}»`);
    return false;
  }

  git(["add", "--", `patches/ai-voice-pack/audio/${opts.lang}`]);
  git(["commit", "-m", message]);
  const head = git(["rev-parse", "--short", "HEAD"]).trim();
  log(`${opts.lang}: коммит ${head} — ${files.length} файлов, ${done}/${total}`);

  if (opts.push) {
    try {
      git(["push"]);
      log(`${opts.lang}: запушено в origin`);
    } catch (e) {
      log(`${opts.lang}: push не удался: ${String(e).slice(0, 160)}`);
    }
  }
  return true;
};

const main = (): void => {
  const opts = parseArgs(process.argv.slice(2));
  log(`старт: язык ${opts.lang}, порог ${opts.min}, режим ${opts.every ? `каждые ${opts.every} мин` : "один раз"}`);

  if (!opts.every) {
    tick(opts);
    return;
  }
  tick(opts);
  setInterval(() => tick(opts), opts.every * 60_000);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
