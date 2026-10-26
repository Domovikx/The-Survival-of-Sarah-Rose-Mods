import assert from "node:assert";
import { test } from "node:test";
import { buildUserPrompt, extractMessage, isValidMessage } from "./commit_msg.mts";

test("валидация: Conventional Commits со списком type принимается", () => {
  assert.ok(isValidMessage("po(tools): выпилена проверка длины"));
  assert.ok(isValidMessage("fix(voice): исправлен резолв рефа"));
  assert.ok(isValidMessage("chore: обновлены зависимости"));
  assert.ok(isValidMessage("i18n(po): добавлен перевод UI"));
  assert.ok(isValidMessage("feat!: новый пайплайн")); // с bang
});

test("валидация: мусор отклоняется", () => {
  assert.equal(isValidMessage("Обычный текст без типа"), false);
  assert.equal(isValidMessage(""), false);
  assert.equal(isValidMessage("Done."), false);
  // похоже, но type вне списка — не пропускаем
  assert.equal(isValidMessage("upd: что-то"), false);
});

test("extractMessage: снимает ```-обёртку", () => {
  const raw = "```\npo(tools): добавлен скрипт\n\n- пункт\n```";
  assert.equal(extractMessage(raw), "po(tools): добавлен скрипт\n\n- пункт");
});

test("extractMessage: отбрасывает пояснение до subject", () => {
  const raw = "Вот сообщение коммита:\n\npo(tools): добавлен скрипт\n\n- пункт";
  assert.equal(extractMessage(raw), "po(tools): добавлен скрипт\n\n- пункт");
});

test("extractMessage: валидный ответ сразу — без изменений", () => {
  const raw = "fix(po): исправлен резолв\n\n- тело";
  assert.equal(extractMessage(raw), raw);
});

test("buildUserPrompt: содержит stat, обрезанный diff и запрет на Markdown", () => {
  const p = buildUserPrompt("3 файла изменено", "diff --git a/x b/x");
  assert.ok(p.includes("3 файла изменено"));
  assert.ok(p.includes("diff --git a/x b/x"));
  assert.ok(p.includes("никаких ```"));
});

test("buildUserPrompt: длинный diff обрезается лимитом", () => {
  const huge = "x".repeat(50_000);
  const p = buildUserPrompt("stat", huge);
  assert.ok(p.includes("[обрезано]"));
  assert.ok(p.length < 20_000);
});
