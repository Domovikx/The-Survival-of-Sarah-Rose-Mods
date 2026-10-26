#!/usr/bin/env node
/**
 * commit_msg.mts — генератор сообщения коммита локальной LLM (LM Studio).
 *
 * Хук: `.husky/prepare-commit-msg` -> `node scripts/commit_msg.mts "$1" "$2"`.
 * Работает ТОЛЬКО при обычном `git commit` (без -m/-F/-C/-c, без merge/squash):
 * если сообщение уже задано пользователем или хуком — выходим и не трогаем файл.
 *
 * Вход: git diff --cached (stat + урезанный патч) -> qwen3.5-9b на
 * 127.0.0.1:1234 -> валидация формата Conventional Commits -> COMMIT_EDITMSG.
 *
 * Безопасность (правило «не мешать»):
 *   - любой сбой/таймаут/отсутствие LLM => exit 0, файл НЕ трогается,
 *     git откроет штатный редактор с дефолтным шаблоном;
 *   - невалидный ответ (не type(scope): subject) => тоже не пишем;
 *   - отключается `TSSR_COMMIT_LLM=0` (env) — для CI/параллельных прогонов.
 *
 * Сухой прогон без записи: `node scripts/commit_msg.mts --print`.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const LLM_URL = "http://127.0.0.1:1234/v1/chat/completions";
const MODEL = "qwen/qwen3.5-9b";
const TIMEOUT_MS = 30_000;
const MAX_TOKENS = 400;
/** Обрезка diff перед отправкой (po-файлы весят мегабайты). */
const DIFF_LIMIT = 12_000;

/** Разрешённые type из Conventional Commits (в т.ч. наш `po`, `i18n`, `deps`). */
const TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
  "po",
  "i18n",
  "deps",
];
const SUBJECT_RE = new RegExp(`^(${TYPES.join("|")})(\\([^)]+\\))?!?:\\s*\\S`, "i");

const SYSTEM = [
  "Ты — опытный разработчик, пишущий сообщения git-коммитов для репозитория",
  "модов к игре (переводы po, голосовой пайплайн на TypeScript/Python, лендинг).",
  "Пишешь КОРОТКО и по делу, по-русски, стилистика Conventional Commits.",
].join(" ");

const RULES = [
  "Правила:",
  "1. Первая строка (subject): `type(scope): суть изменения` — type из списка",
  `   [${TYPES.join(", ")}], scope — подсистема (po, tools, docs, site, voice, pack...).`,
  "2. Subject на русском, ≤72 символов, без точки в конце, от первого лица",
  "   не ведётся — констатируется факт («добавлено», «выпилено», «исправлено»).",
  "3. Если изменений много и разнородных — пустая строка и body списком",
  "   из 2-5 пунктов по сути (что и почему), по-русски.",
  "4. Никакого Markdown, никаких ```, никаких пояснений кроме самого сообщения.",
  "5. Не выдумывай: опирайся ТОЛЬКО на присланный diff.",
].join("\n");

/** Обрезка diff перед отправкой: большие po-файлы не должны жрать контекст. */
export function truncateDiff(diff: string): string {
  return diff.length > DIFF_LIMIT ? diff.slice(0, DIFF_LIMIT) + "\n...[обрезано]" : diff;
}

export function buildUserPrompt(stat: string, diff: string): string {
  diff = truncateDiff(diff);
  return [
    RULES,
    "",
    "`git diff --cached --stat`:",
    stat,
    "",
    "`git diff --cached` (урезан):",
    diff,
    "",
    "Верни только сообщение коммита.",
  ].join("\n");
}

/** Снимает ```-обёртку и ведущие пояснения модели, если она их всё же добавила. */
export function extractMessage(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```[a-zA-Z]*\s*\n?/, "").replace(/\n?```\s*$/, "");
  const lines = s.split("\n");
  const start = lines.findIndex((l) => SUBJECT_RE.test(l.trim()));
  if (start > 0) s = lines.slice(start).join("\n");
  return s.trim();
}

export function isValidMessage(msg: string): boolean {
  return SUBJECT_RE.test(msg.split("\n")[0]?.trim() ?? "");
}

/** Достаёт из git только нужное; ошибки git => null (выход без записи). */
function gitDiff(): { stat: string; diff: string } | null {
  try {
    const stat = execFileSync("git", ["diff", "--cached", "--stat"], {
      encoding: "utf-8",
      maxBuffer: 8 * 1024 * 1024,
    }).trim();
    if (!stat) return null;
    const full = execFileSync("git", ["diff", "--cached"], {
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return { stat, diff: truncateDiff(full) };
  } catch {
    return null;
  }
}

export async function generate(userPrompt: string): Promise<string | null> {
  const dbg = process.env.TSSR_COMMIT_DEBUG === "1";
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(LLM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ac.signal,
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: MAX_TOKENS,
        // ВАЖНО (A/B тест 2026-10-26): qwen3.5-9b в LM Studio по умолчанию
        // думает и упаковывает ВСЁ в reasoning_content, оставляя content
        // пустым (finish=length, 2.5-5К токенов на diff). Работает ТОЛЬКО
        // `reasoning_effort: "none"` — `think:false`, `enable_thinking:false`
        // (top-level и chat_template_kwargs), `reasoning:{effort}` — не гасят.
        reasoning_effort: "none",
      }),
    });
    if (!res.ok) {
      if (dbg) console.error("[dbg] HTTP", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      if (dbg) console.error("[dbg] пустой content:", JSON.stringify(data).slice(0, 400));
      return null;
    }
    const msg = extractMessage(content);
    const ok = isValidMessage(msg) ? msg : null;
    if (dbg) console.error("[dbg] raw:", JSON.stringify(content).slice(0, 500), "\n[dbg] валидно:", !!ok);
    return ok;
  } catch (e) {
    if (dbg) console.error("[dbg] исключение:", e instanceof Error ? e.message : String(e));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const printOnly = argv.includes("--print");
  const [msgFile, source] = argv.filter((a) => a !== "--print");

  // Без файла писать некуда (кроме --print-режима): выходим ДО обращения к LLM.
  if (!printOnly && !msgFile) return;

  // 1. Только «чистый» git commit: source пуст (у -m/-F это "message",
  //    у merge/squash — свои значения, у -c/-C — "commit"). Ничего не мешаем.
  if (source) return;
  if (process.env.TSSR_COMMIT_LLM === "0") return;

  // 2. В файле уже есть не-комментарии (merge и пр.) — не трогаем.
  if (msgFile && !printOnly) {
    try {
      const existing = readFileSync(msgFile, "utf-8");
      if (existing.split("\n").some((l) => l.trim() && !l.startsWith("#"))) return;
    } catch {
      return;
    }
  }

  // 3. Diff и LLM: любой сбой => тихо выходим, git откроет штатный шаблон.
  const d = gitDiff();
  if (!d) return;
  const msg = await generate(buildUserPrompt(d.stat, d.diff));
  if (!msg) {
    console.error("[commit-msg] локальная LLM не дала валидное сообщение — оставляю штатный шаблон");
    return;
  }
  if (printOnly) {
    console.log(msg);
    return;
  }
  // msgFile гарантирован ранней проверкой выше; повтор — для сужения типа (TS2345)
  if (!msgFile) return;
  writeFileSync(msgFile, msg + "\n", "utf-8");
}

// Запуск только при прямом вызове (тесты импортируют чистые функции).
const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("commit_msg.mts") ?? false;
if (invokedDirectly) await main();
