/**
 * po_live_guard.test.mts — политика «не коммитить po во время прогона».
 *
 * Симптом 2026-11-16: коммит во время работы переводчика потерял 59 строк pt
 * (husky → lint-staged утащил их в stash, файл откатился к HEAD). Гейт должен
 * блокировать ровно этот случай и не мешать всему остальному.
 *
 * Запуск: node --test scripts/po_live_guard.test.mts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldBlock } from "./po_live_guard.mts";

const PO = ["patches/ai-voice-pack/po/pt.po"];

test("блокирует: прогон идёт И в индексе po", () => {
  assert.equal(shouldBlock(2, PO), true);
});

test("не блокирует: прогон идёт, но po не коммитим", () => {
  assert.equal(shouldBlock(3, []), false);
});

test("не блокирует: po в индексе, но прогон остановлен", () => {
  assert.equal(shouldBlock(0, PO), false);
});

test("не блокирует: осознанный обход через TSSR_COMMIT_WHILE_TRANSLATING=1", () => {
  assert.equal(shouldBlock(2, PO, true), false);
});
