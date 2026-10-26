/**
 * po_commit.mts — одна локальная команда вместо ручной рутины:
 *
 *   валидация po (po_check) -> что изменилось -> git commit ТОЛЬКО по po-путям
 *
 * ВАЖНО: коммит идёт через `git commit -- <пути>`, а не голым `git commit`:
 * иначе в po-коммит уезжают случайно застейдженные чужие файлы (инцидент
 * eec70f91f). Чужое в index не трогаем, но обязательно перечисляем — иначе
 * создается ложное впечатление, что оно уже закоммичено.
 *
 * Сообщение коммита ГЕНЕРИРУЕТСЯ локальной LLM: хук .husky/prepare-commit-msg
 * вызывает scripts/commit_msg.mts (qwen3.5-9b на 127.0.0.1:1234). Скрипт не
 * передаёт -m, чтобы хук отработал; GIT_EDITOR=true чтобы git не открывал
 * редактор (нужен флаг --edit).
 *
 * Использование:
 *   node scripts/po_commit.mts            # валидация + add всех po + коммит
 *   node scripts/po_commit.mts --edit     # то же, но открыть редактор
 *   node scripts/po_commit.mts --dry      # только валидация и что бы ушло
 *   node scripts/po_commit.mts --wait     # ДОЖДАТЬСЯ остановки всех очередей
 *                                          #   перевода, потом валидация + коммит
 *   --wait-timeout N   лимит ожидания в минутах (по умолчанию 240)
 *   --wait-stable N    сколько ПОДРЯД проверок «стоп» нужно увидеть
 *                      (по умолчанию 3 x 20с = 60с) — иначе можно поймать
 *                      паузу МЕЖДУ языками, когда очередь ещё не кончилась
 *
 * Выход 1 = валидация не прошла / ожидание истекло, ничего не коммитится.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const cliArgs = process.argv.slice(2);
const argv = new Set(cliArgs);
const edit = argv.has("--edit");
const dry = argv.has("--dry");
const wait = argv.has("--wait");
const flag = (name: string, def: string): string => {
  const i = cliArgs.indexOf(`--${name}`);
  return i >= 0 && cliArgs[i + 1] ? cliArgs[i + 1] : def;
};
const WAIT_TIMEOUT_MIN = Number(flag("wait-timeout", "240"));
const WAIT_STABLE = Math.max(1, Number(flag("wait-stable", "3")));
const POLL_MS = 20_000;

/** Есть ли хоть один бегущий прогон po:translate. */
function queueRunning(): boolean {
  try {
    const out = execFileSync(process.execPath, [".opencode/skills/renpy-po/po_translate.mts", "--ctl", "status"], {
      encoding: "utf-8",
      maxBuffer: 8 * 1024 * 1024,
    });
    return out.includes("ИДЁТ");
  } catch {
    // пульт не ответил — не считаем это «стопом» только по одной проверке
    return true;
  }
}

/** Ждём НЕПРЕРЫВНОГО стопа всех очередей (см. --wait-stable). */
async function waitForQueue(): Promise<"stopped" | "timeout"> {
  const deadline = Date.now() + WAIT_TIMEOUT_MIN * 60_000;
  let idleStreak = 0;
  let lastReport = 0;
  while (Date.now() < deadline) {
    if (queueRunning()) {
      idleStreak = 0;
      const now = Date.now();
      // отчёт раз в 2 минуты, чтобы не спамить
      if (now - lastReport > 120_000) {
        console.log(`[po:commit] очередь ещё работает, жду (стоп-проверка ${idleStreak}/${WAIT_STABLE})...`);
        lastReport = now;
      }
    } else {
      idleStreak++;
      console.log(`[po:commit] стоп подтверждён ${idleStreak}/${WAIT_STABLE}`);
      if (idleStreak >= WAIT_STABLE) return "stopped";
    }
    // опрос очереди — намеренно последовательный, параллелить незачем
    // eslint-disable-next-line no-await-in-loop
    await sleep(POLL_MS);
  }
  return "timeout";
}

function run(cmd: string, args: string[], opts: { check?: boolean; env?: NodeJS.ProcessEnv } = {}): string {
  const r = spawnSync(cmd, args, { encoding: "utf-8", env: { ...process.env, ...opts.env } });
  if (r.status !== 0 && opts.check !== false) {
    process.stderr.write(r.stdout ?? "");
    process.stderr.write(r.stderr ?? "");
    throw new Error(`${cmd} ${args.join(" ")} -> exit ${r.status}`);
  }
  return `${r.stdout ?? ""}${r.stderr ?? ""}`;
}

// 0. опциональное ожидание остановки очередей перевода
if (wait) {
  console.log(
    `[po:commit] жду остановки очередей (лимит ${WAIT_TIMEOUT_MIN}м, нужно ${WAIT_STABLE} проверок "стоп" подряд)...`,
  );
  const r = await waitForQueue();
  if (r === "timeout") {
    console.error(`[po:commit] очередь не остановилась за ${WAIT_TIMEOUT_MIN}м — коммит ОТЛОЖЕН`);
    process.exit(1);
  }
  console.log("[po:commit] очереди остановлены, продолжаю");
}

// 1. валидация: порча po = выход 1, коммит не делаем
try {
  execFileSync(process.execPath, ["scripts/po_check.mts"], { stdio: "inherit" });
} catch {
  console.error("\n[po:commit] валидация не прошла — коммит ОТМЕНЁН");
  process.exit(1);
}

// 2. какие po реально отличаются от HEAD (staged или ещё нет)
const PO_DIR = "patches/ai-voice-pack/po";
const poPaths = [
  ...new Set([
    ...run("git", ["diff", "--name-only", "HEAD", "--", PO_DIR]).split("\n").filter(Boolean),
    ...run("git", ["diff", "--cached", "--name-only", "--", PO_DIR]).split("\n").filter(Boolean),
  ]),
]
  .filter((p) => p.endsWith(".po"))
  .toSorted();

if (!poPaths.length) {
  console.log("[po:commit] изменений в po нет — нечего коммитить");
  process.exit(0);
}

// 2b. В index могут лежать чужие файлы: `git commit` без путей взял бы их
// целиком (инцидент eec70f91f — в po-коммит уехали scripts/*). Мы коммитим
// ТОЛЬКО po-пути, но молчать о чужом в index тоже нельзя: иначе человек
// решит, что всё уже закоммичено.
const stagedAll = run("git", ["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
const foreign = stagedAll.filter((p) => !p.startsWith(`${PO_DIR}/`));
if (foreign.length) {
  console.log(`\n[po:commit] в index есть НЕ-po файлы — в этот коммит они НЕ попадут:`);
  for (const p of foreign) console.log("  - " + p);
}

// 3. что именно уйдёт
console.log("\n[po:commit] изменённые po:");
for (const p of poPaths) console.log("  " + p);
const stat = run("git", ["diff", "--stat", "HEAD", "--", ...poPaths]);
console.log("\n[po:commit] в коммит пойдёт:");
console.log(stat.trimEnd());

if (dry) {
  console.log("\n[po:commit] --dry: дальше был бы git commit (сообщение написала бы локальная LLM)");
  process.exit(0);
}

// 4. коммит ТОЛЬКО po-путей, БЕЗ -m: сообщение генерирует хук на локальной LLM.
// `git commit -- <пути>` записывает рабочее содержимое этих путей и НЕ трогает
// остальное содержимое index — чужие стейджи остаются висеть, но не уезжают.
const env: NodeJS.ProcessEnv = edit ? {} : { GIT_EDITOR: "true" };
console.log("\n[po:commit] коммит (сообщение пишет локальная qwen3.5-9b)...");
const out = run("git", ["commit", "--", ...poPaths], { env });

const head = run("git", ["log", "-1", "--format=%B"]).trimEnd();
console.log("\n[po:commit] ГОТОВО:");
console.log("─".repeat(60));
console.log(head);
console.log("─".repeat(60));
console.log(run("git", ["log", "-1", "--oneline"]).trimEnd());
if (out.includes("husky")) console.log(out.trimEnd());
