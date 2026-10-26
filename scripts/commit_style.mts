/**
 * commit_style.mts — валидатор СТИЛЯ git-сообщений. Чистые функции, без I/O.
 *
 * ⚠️ ГРАНИЦА (AGENTS.md, приказ 2026-10-26): запрет проверок длины касается
 * ПЕРЕВОДА — сравнения длины msgstr с длиной msgid. Это здесь НЕ то: речь о
 * формате заголовка git-коммита (Conventional Commits), к качеству перевода
 * отношения не имеющем. Модуль намеренно вынесен ОТДЕЛЬНО от po_*.mts и
 * ни в один po-инструмент не импортируется — граница проверяется тестом
 * `commit_style.test.mts::«po-инструменты не импортируют валидатор стиля»`.
 *
 * Зачем: LLM-коммитер иногда выдавал subject одной строкой без тела
 * (см. def3a2a3f) либо растянутый. Проверяем структуру, а не смысл —
 * смысл остаётся за генератором.
 *
 * Использование:
 *   node scripts/commit_style.mts --lint <файл>   # проверить сообщение в файле
 *   node scripts/commit_style.mts --lint -        # ...или из stdin
 * Выход 0 — стиль ок, 1 — есть замечания.
 */

import { readFileSync } from "node:fs";

/** Жёсткий лимит subject: стандарт Conventional Commits / перенос git'а. */
export const MAX_SUBJECT = 72;
/** Практический лимит строки тела (комментарии, списки). */
export const MAX_BODY_LINE = 100;

/** type(scope): обязателен; scope опционален. */
const TYPE_SCOPE_RE = /^[a-z]+(\([^)\s]+\))?!?:\s+\S/i;

/**
 * Замечания по стилю коммита. Пустой массив = всё по правилам.
 * Проверяется ТОЛЬКО форма: длина заголовка, структура, переносы.
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
    out.push(`subject ${s.length} симв. > ${MAX_SUBJECT} — перенеси суть в тело`);
  }
  if (s.endsWith(".")) out.push("subject не должен заканчиваться точкой");
  if (/[`*_#|<>]/.test(s)) out.push("subject не должен содержать markdown-разметку");
  if (/^\s+\S/.test(lines[0])) out.push("subject не должен начинаться с пробела");

  // тело — только если оно есть
  const bodyLines = body.filter((l) => l.trim().length > 0);
  if (bodyLines.length) {
    if (body[0]?.trim()) out.push("перед телом обязателен пустой рядок");
    bodyLines.forEach((l, i) => {
      if (l.length > MAX_BODY_LINE) out.push(`строка тела #${i + 1}: ${l.length} симв. > ${MAX_BODY_LINE}`);
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
