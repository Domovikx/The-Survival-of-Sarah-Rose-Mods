import assert from "node:assert";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_SUBJECT, checkCommitMessage, isStyleOk } from "./commit_style.mts";

const ok = (msg: string): void => {
  const p = checkCommitMessage(msg);
  assert.deepEqual(p, [], `неожиданные замечания: ${p.join(" | ")}`);
};
const bad = (msg: string, needle: string): void => {
  const p = checkCommitMessage(msg);
  assert.ok(p.length > 0, `ожидали замечаний, а их нет: "${msg.slice(0, 60)}"`);
  assert.ok(
    p.some((x) => x.includes(needle)),
    `замечание без "${needle}": ${p.join(" | ")}`,
  );
};

test("валидный однострочный коммит проходит", () => {
  ok("feat(po): добавлен флаг --tries");
  ok("fix(voice): исправлен резолв рефа");
  ok("chore: обновлены зависимости");
  ok("revert: откат изменений"); // без scope — допустимо
  assert.ok(isStyleOk("feat(tools): добавлена утилита"));
});

test("ОДИН ХАРАКТЕР сверх лимита = замечание (subject ≤72)", () => {
  const head = "feat(po): ";
  const long = head + "а".repeat(MAX_SUBJECT - head.length + 1); // ровно 73
  assert.equal(long.length, MAX_SUBJECT + 1);
  bad(long, `> ${MAX_SUBJECT}`);
  // ровно 72 — ок
  ok(head + "б".repeat(MAX_SUBJECT - head.length));
});

test("длина вообще НЕ смотрится на тело — только на заголовок", () => {
  // тело может быть любым по объёму смысла; лимит строки тела — про переносы
  const body = "ok".repeat(40); // 80 символов — в пределах MAX_BODY_LINE
  ok(`feat(po): короткий заголовок\n\n- ${body}`);
  // а 101 символ в строке тела — уже замечание про перенос
  bad(`feat(po): короткий\n\n- ${"x".repeat(101)}`, "строка тела");
});

test("структурные нарушения ловятся", () => {
  bad("просто текст без типа", "не в формате type(scope)");
  bad("feat: заканчивается точкой.", "точкой");
  bad("feat: с `markdown` внутри", "markdown");
  bad("feat: **жирный**", "markdown");
  bad("  feat: начинается с пробела", "пробела");
});

test("НЕ markdown: одиночное подчёркивание в имени файла и #номер issue", () => {
  // ловушка, найденная 2026-10-26: детектор принимал `commit_msg.mts`
  // за _курсив_ и отклонял нормальный subject
  ok("fix(tools): исправлена логика генерации в commit_msg.mts");
  ok("fix(#123): опечатка в описании команды");
  ok("refactor(po): правка voice_batch.mts и voice_ctl.py");
  // а парные подчёркивания — таки markdown
  bad("fix: _курсив_ внутри", "markdown");
});

test("тело: обязателен пустой рядок, хвостовые пробелы — замечание", () => {
  bad("feat(po): ok\n- тело без пустого ряда", "пустой рядок");
  bad("feat(po): ok\n\n- пункт   ", "лишние пробелы");
});

test("граничные случаи", () => {
  assert.deepEqual(checkCommitMessage(""), ["сообщение пустое"]);
  assert.deepEqual(checkCommitMessage("   \n  "), ["сообщение пустое"]);
  // срывающиеся на \r\n не должны ломать разбор
  ok("feat(po): ok\r\n\r\n- пункт");
});

test("ГРАНИЦА: po-инструменты НЕ импортируют валидатор стиля коммитов", () => {
  // Запрет длины (AGENTS.md) — про ПЕРЕВОД. Валидатор стиля git-сообщений
  // живёт отдельно, и его не должно тянуть в po-контур ни на каком пути.
  const dir = join(import.meta.dirname, "..", ".opencode", "skills", "renpy-po");
  const offenders: string[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".mts")) continue;
    const src = readFileSync(join(dir, f), "utf-8");
    if (src.includes("commit_style") || /checkCommitMessage|MAX_SUBJECT/.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], `po-инструменты импортируют стиль коммитов: ${offenders.join(", ")}`);
});
