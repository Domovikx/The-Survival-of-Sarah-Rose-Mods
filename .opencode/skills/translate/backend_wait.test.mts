/** Тесты решения «ждать бэкенд или считать строку сбойной» (инцидент 2026-11-14). */
import assert from "node:assert/strict";
import { test } from "node:test";

import { retryDecision } from "./backend_wait.mts";

const MAX = 45 * 60_000;

test("fetch failed (Strata рестартует) — ждём, строку не теряем", () => {
  assert.equal(retryDecision(new TypeError("fetch failed"), 0, MAX).wait, true);
  assert.equal(retryDecision(new Error("connect ECONNREFUSED 127.0.0.1:8080"), 0, MAX).wait, true);
  assert.equal(retryDecision(new Error("socket hang up"), 10_000, MAX).wait, true);
  assert.equal(retryDecision(new Error("The operation was aborted due to timeout ECONNRESET"), 10_000, MAX).wait, true);
});

test("пустой ответ модели — НЕ сетевая ошибка (лечится повтором с температурой)", () => {
  assert.equal(retryDecision(new Error('{"error":{"message":"bad"}}'), 0, MAX).wait, false);
  assert.equal(retryDecision(new Error("искажение имени «Кэролин»"), 0, MAX).wait, false);
});

test("предел ожидания: бэкенд не вернулся — обычный сбой строки", () => {
  assert.equal(retryDecision(new TypeError("fetch failed"), MAX, MAX).wait, false);
  assert.equal(retryDecision(new TypeError("fetch failed"), MAX - 1, MAX).wait, true);
});

test("причина решения заполнена (для лога)", () => {
  assert.match(retryDecision(new TypeError("fetch failed"), 0, MAX).reason, /ждём/);
  assert.match(retryDecision(new Error("мусор"), 0, MAX).reason, /не сетевая/);
});
