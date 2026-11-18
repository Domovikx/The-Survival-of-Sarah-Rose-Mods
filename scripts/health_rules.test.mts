/**
 * health_rules.test.mts — правила контура (см. health_rules.mts).
 *
 * Эти два правила уже стоили нам часов простоя, поэтому фиксируем их тестом:
 * страж НЕ должен гасить прогон по RAM и по «питанию на потолке», а слоты
 * переключаются строго по порогу простоя.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { awayThresholdSec, chooseNp, stopReason, type NpRules } from "./health_rules.mts";

const RULES: NpRules = { idleMin: 15, awayNp: 8, hereNp: 4 };

test("страж НЕ останавливает прогон по RAM и по потолку питания", () => {
  // Инцидент 2026-11-17: «RAM свободно 4 %» погасил живой прогон на 3 часа.
  assert.equal(stopReason(["RAM_МАЛО 4%"]), undefined);
  assert.equal(stopReason(["питание_на_потолке 285.2/300Вт"]), undefined);
  assert.equal(stopReason(["ДИСК_МАЛО 3.2ГБ"]), undefined);
  assert.equal(stopReason([]), undefined);
});

test("страж останавливает только по перегреву GPU", () => {
  assert.equal(stopReason(["GPU_ЖАР 87°C"]), "GPU_ЖАР 87°C");
  assert.equal(stopReason(["RAM_МАЛО 3%", "GPU_ЖАР 90°C"]), "GPU_ЖАР 90°C");
});

test("слоты: за ПК — мягкий режим, отошёл дольше порога — максимум", () => {
  assert.equal(chooseNp(0, RULES), 4);
  assert.equal(chooseNp(60, RULES), 4);
  assert.equal(chooseNp(14 * 60, RULES), 4);
  assert.equal(chooseNp(15 * 60, RULES), 8, "ровно на пороге уже переключаемся");
  assert.equal(chooseNp(60 * 60, RULES), 8);
});

test("датчик простоя недоступен (простой < 0) — считаем, что человек за ПК", () => {
  // idleSeconds() возвращает -1, если PowerShell не ответил: нельзя уходить
  // в агрессивный режим по неизвестному простою.
  assert.equal(chooseNp(-1, RULES), 4);
});

test("порог переключения в секундах совпадает с минутами в правилах", () => {
  assert.equal(awayThresholdSec(RULES), 900);
  assert.equal(chooseNp(awayThresholdSec(RULES) - 1, RULES), 4);
  assert.equal(chooseNp(awayThresholdSec(RULES), RULES), 8);
});
