/**
 * commit_style.mts — валидатор ФОРМЫ git-сообщения (Conventional Commits).
 *
 * Зачем: генератор (scripts/commit_msg.mts) пишет сообщения локальной LLM,
 * а она выдаёт разное — от аккуратного «заголовок + тело» до одной
 * растянутой строки (def3a2a3f). Здесь проверяется ТОЛЬКО форма:
 * структура `type(scope):`, длина заголовка, пустой рядок перед телом,
 * переносы, markdown. СМЫСЛ сообщения остаётся за генератором.
 *
 * ГРАНИЦА с запретом длины (AGENTS.md, приказ владельца 2026-10-26):
 * тот запрет касается ПЕРЕВОДА (длина msgstr против msgid), а здесь
 * проверяется артефакт к переводу не относящийся — форма git-записи.
 * Соблюдение закреплено архитектурно: модуль не импортируется ни одним
 * po-инструментом, это проверяет тест
 * `commit_style.test.mts::«po-инструменты НЕ импортируют валидатор стиля коммитов»`.
 *
 * API (чистые функции, без I/O):
 *   checkCommitMessage(msg) -> string[]   замечания; [] = всё по правилам
 *   isStyleOk(msg)          -> boolean
 *
 * CLI (хуки, ручная проверка):
 *   node scripts/commit_style.mts --lint <файл>    exit 0 — ок, 1 — замечания
 *   node scripts/commit_style.mts --lint -         то же, но из stdin
 */

import { readFileSync } from "node:fs";

/** Жёсткий лимит subject: стандарт Conventional Commits / перенос git'а. */
export const MAX_SUBJECT = 72;
/** Практический лимит строки тела (комментарии, списки). */
export const MAX_BODY_LINE = 100;

/** type(scope): обязателен; scope опционален. */
const TYPE_SCOPE_RE = /^[a-z]+(\([^)\s]+\))?!?:\s+\S/i;

/**
 * Замечания по форме сообщения; пустой массив = всё по правилам.
 * Проверки — см. док-блок модуля (структура, длина заголовка, переносы).
 */
export function checkCommitMessage(msg: string): string[] {
  const out: string[] = [];
  // НЕ trimEnd'им всё сразу: хвостовые пробелы в теле — отдельное замечание,
  // а их бы съел общий trim.
  const normalized = msg.replace(/\r\n/g, "\n");
  if (!normalized.trim()) return ["сообщение пустое"];

  const lines = normalized.split("\n");
  const s = lines[0].trimEnd();
  const body = lines.slice(1);

  if (!TYPE_SCOPE_RE.test(s)) {
    out.push(`subject не в формате type(scope): ... — "${s.slice(0, 60)}"`);
  }
  if (s.length > MAX_SUBJECT) {
    out.push(`subject: ${s.length} символов > ${MAX_SUBJECT} — перенеси суть в тело`);
  }
  if (s.endsWith(".")) out.push("subject не должен заканчиваться точкой");
  // markdown в subject: обратные кавычки, |, <>, *жирный*, _курсив_ (парные
  // подчёркивания). Одинокий `_` (имена файлов: commit_msg.mts) и `#123`
  // (ссылки на issues) — НЕ markdown и не должны ругаться.
  if (/[`|<>]|\*\S|_\S+_/.test(s)) out.push("subject не должен содержать markdown-разметку");
  if (/^\s+\S/.test(lines[0])) out.push("subject не должен начинаться с пробела");

  // тело — только если оно есть
  const bodyLines = body.filter((l) => l.trim().length > 0);
  if (bodyLines.length) {
    if (body[0]?.trim()) out.push("перед телом обязателен пустой рядок");
    bodyLines.forEach((l, i) => {
      if (l.length > MAX_BODY_LINE) out.push(`строка тела #${i + 1}: ${l.length} символов > ${MAX_BODY_LINE}`);
      if (l.trimEnd() !== l) out.push(`строка тела #${i + 1}: лишние пробелы в конце`);
    });
  }
  return out;
}

/** Сообщение годится как есть? */
export function isStyleOk(msg: string): boolean {
  return checkCommitMessage(msg).length === 0;
}

// ── CLI ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("commit_style.mts") ?? false;

if (invokedDirectly && argv.includes("--lint")) {
  const i = argv.indexOf("--lint");
  const target = argv[i + 1];
  let text = "";
  if (target === "-") {
    text = readFileSync(0, "utf-8");
  } else if (target) {
    text = readFileSync(target, "utf-8");
  } else {
    console.error("укажи файл или - для stdin");
    process.exit(2);
  }
  const problems = checkCommitMessage(text);
  if (problems.length) {
    console.error("[commit:style] замечания:");
    for (const p of problems) console.error("  ✗ " + p);
    process.exit(1);
  }
  console.log(`[commit:style] ок (subject ${text.split("\n")[0].length}/${MAX_SUBJECT})`);
} else if (invokedDirectly) {
  console.error("использование: node scripts/commit_style.mts --lint <файл>| -");
  process.exit(2);
}
