import assert from "node:assert/strict";
import { test } from "node:test";

import { commitMessage, parseArgs, planTotal } from "./voice_autocommit.mts";

test("commitMessage: готово/осталось и процент без вранья", () => {
  const msg = commitMessage("en", 620, 5000, 68357);
  assert.match(msg, /\+620 реплик/);
  assert.match(msg, /5000 \/ 68357/);
  assert.match(msg, /7\.3%/);
  assert.match(msg, /осталось 63357/);
  // На финише остаток не уходит в минус.
  const done = commitMessage("en", 10, 68357, 68357);
  assert.match(done, /осталось 0/);
  assert.match(done, /100\.0%/);
});

test("parseArgs: дефолты и флаги", () => {
  assert.deepEqual(parseArgs([]), { lang: "en", min: 500, every: null, dry: false, push: false });
  const o = parseArgs(["--lang", "ru", "--min", "100", "--every", "15", "--dry", "--push"]);
  assert.equal(o.lang, "ru");
  assert.equal(o.min, 100);
  assert.equal(o.every, 15);
  assert.equal(o.dry, true);
  assert.equal(o.push, true);
});

test("planTotal(en) = все озвучиваемые строки POT", () => {
  assert.ok(planTotal("en") > 60000, `план EN подозрительно мал: ${planTotal("en")}`);
});
