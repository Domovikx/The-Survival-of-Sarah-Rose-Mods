import assert from "node:assert/strict";
import { test } from "node:test";

import { desiredWorkers, parseArgs } from "./voice_adaptive.mts";

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
  });
  const o = parseArgs(["--lang", "ru", "--idle", "120", "--poll", "15", "--dry", "--full", "3"]);
  assert.equal(o.lang, "ru");
  assert.equal(o.idle, 120);
  assert.equal(o.poll, 15);
  assert.equal(o.dry, true);
  assert.equal(o.full, 3);
});
