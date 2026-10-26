/**
 * po_commit.mts — одна локальная команда вместо ручной рутины:
 *
 *   валидация po (po_check) -> git add -> git diff --stat -> git commit
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
 *
 * Выход 1 = валидация не прошла, ничего не коммитится.
 */
import { execFileSync, spawnSync } from "node:child_process";

const argv = new Set(process.argv.slice(2));
const edit = argv.has("--edit");
const dry = argv.has("--dry");

function run(cmd: string, args: string[], opts: { check?: boolean; env?: NodeJS.ProcessEnv } = {}): string {
  const r = spawnSync(cmd, args, { encoding: "utf-8", env: { ...process.env, ...opts.env } });
  if (r.status !== 0 && opts.check !== false) {
    process.stderr.write(r.stdout ?? "");
    process.stderr.write(r.stderr ?? "");
    throw new Error(`${cmd} ${args.join(" ")} -> exit ${r.status}`);
  }
  return `${r.stdout ?? ""}${r.stderr ?? ""}`;
}

// 1. валидация: порча po = выход 1, коммит не делаем
try {
  execFileSync(process.execPath, ["scripts/po_check.mts"], { stdio: "inherit" });
} catch {
  console.error("\n[po:commit] валидация не прошла — коммит ОТМЕНЁН");
  process.exit(1);
}

// 2. что вообще изменено
const status = run("git", ["status", "--short", "--", "patches/ai-voice-pack/po"]);
if (!status.trim()) {
  console.log("[po:commit] изменений в po нет — нечего коммитить");
  process.exit(0);
}
console.log("\n[po:commit] изменённые po:");
console.log(status.trimEnd());

// 3. стейдж
run("git", ["add", "patches/ai-voice-pack/po"]);
const stat = run("git", ["diff", "--cached", "--stat", "--", "patches/ai-voice-pack/po"]);
console.log("\n[po:commit] staged:");
console.log(stat.trimEnd());

if (dry) {
  console.log("\n[po:commit] --dry: дальше был бы git commit (сообщение написала бы локальная LLM)");
  process.exit(0);
}

// 4. коммит БЕЗ -m: сообщение генерирует хук на локальной LLM
const env: NodeJS.ProcessEnv = edit ? {} : { GIT_EDITOR: "true" };
console.log("\n[po:commit] коммит (сообщение пишет локальная qwen3.5-9b)...");
const out = run("git", ["commit"], { env });

const head = run("git", ["log", "-1", "--format=%B"]).trimEnd();
console.log("\n[po:commit] ГОТОВО:");
console.log("─".repeat(60));
console.log(head);
console.log("─".repeat(60));
console.log(run("git", ["log", "-1", "--oneline"]).trimEnd());
if (out.includes("husky")) console.log(out.trimEnd());
