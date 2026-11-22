import assert from "node:assert/strict";
import { test } from "node:test";

import { desiredWorkers, msUntil, parseArgs } from "./voice_adaptive.mts";

test("desiredWorkers: ушёл на 15 мин — два воркера, вернулся — один", () => {
  assert.equal(desiredWorkers(0, 900), 1);
  assert.equal(desiredWorkers(899, 900), 1);
  assert.equal(desiredWorkers(900, 900), 2);
  assert.equal(desiredWorkers(3600, 900), 2);
});

test("parseArgs: дефолты и флаги", () => {
  assert.deepEqual(parseArgs([]), {
    lang: "en",
    idle: 900,
    poll: 60,
    dry: false,
    full: 2,
    maxTemp: 83,
    maxVram: 97,
    startAt: null,
  });
  const o = parseArgs(["--lang", "ru", "--idle", "120", "--poll", "15", "--dry", "--full", "3"]);
  assert.equal(o.lang, "ru");
  assert.equal(o.idle, 120);
  assert.equal(o.poll, 15);
  assert.equal(o.dry, true);
  assert.equal(o.full, 3);
});

test("msUntil: сегодня или завтра, в зависимости от времени", () => {
  const at = (iso: string): Date => new Date(iso);
  // 10:00 → 23:00 = 13 часов
  assert.equal(Math.round(msUntil("23:00", at("2026-11-22T10:00:00")) / 3_600_000), 13);
  // 10:00 → 09:00 = завтра, 23 часа
  assert.equal(Math.round(msUntil("09:00", at("2026-11-22T10:00:00")) / 3_600_000), 23);
  // мусор — «сразу»
  assert.equal(msUntil("нет", at("2026-11-22T10:00:00")), 0);
});
