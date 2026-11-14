/** Юнит-тесты детектора простоя (без PowerShell — раннер подменяется). */
import assert from "node:assert/strict";
import { test } from "node:test";

import { humanDuration, parseIdleMs, parsePrio, readIdleSeconds } from "./idle.mts";

test("parseIdleMs: обычный вывод win.ps1", () => {
  assert.equal(parseIdleMs("IDLE_MS=12345\r\n"), 12345);
  assert.equal(parseIdleMs("IDLE_MS=0"), 0);
});

test("parseIdleMs: мусор и отрицательные значения = «неизвестно»", () => {
  assert.equal(parseIdleMs(""), null);
  assert.equal(parseIdleMs("что-то другое"), null);
  assert.equal(parseIdleMs("IDLE_MS=-1"), null); // GetLastInputInfo не отдал данные
  assert.equal(parseIdleMs("IDLE_MS=abc"), null);
});

test("readIdleSeconds: зовёт win.ps1 -Cmd idle и переводит мс в секунды", () => {
  let seen: string[] = [];
  const sec = readIdleSeconds({
    run: (args) => {
      seen = args;
      return "IDLE_MS=900000\n";
    },
  });
  assert.deepEqual(seen, ["-Cmd", "idle"]);
  assert.equal(sec, 900);
});

test("readIdleSeconds: падение раннера = null (профиль не дёргаем)", () => {
  const sec = readIdleSeconds({
    run: () => {
      throw new Error("powershell недоступен");
    },
  });
  assert.equal(sec, null);
});

test("TSSR_IDLE_SEC: тестовый хук подменяет детектор", () => {
  const saved = process.env.TSSR_IDLE_SEC;
  try {
    process.env.TSSR_IDLE_SEC = "1200";
    assert.equal(readIdleSeconds({ run: () => "IDLE_MS=1" }), 1200);
    process.env.TSSR_IDLE_SEC = "";
    assert.equal(readIdleSeconds({ run: () => "IDLE_MS=1000" }), 1);
    process.env.TSSR_IDLE_SEC = "мусор";
    assert.equal(readIdleSeconds({ run: () => "IDLE_MS=2000" }), 2);
  } finally {
    if (saved === undefined) delete process.env.TSSR_IDLE_SEC;
    else process.env.TSSR_IDLE_SEC = saved;
  }
});

test("parsePrio: приоритет процесса и отсутствие процесса", () => {
  assert.equal(parsePrio('{"pid":1,"prio":"BelowNormal","cpu":1,"ws":2}'), "BelowNormal");
  assert.equal(parsePrio("null"), null);
  assert.equal(parsePrio(""), null);
  assert.equal(parsePrio("битый json"), null);
});

test("humanDuration: часы/минуты для статуса", () => {
  assert.equal(humanDuration(30), "30 с");
  assert.equal(humanDuration(120), "2 мин");
  assert.equal(humanDuration(3 * 3600 + 12 * 60), "3 ч 12 мин");
  assert.equal(humanDuration(50 * 3600), "2 д 2 ч");
});
