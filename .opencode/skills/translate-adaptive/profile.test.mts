/** Юнит-тесты логики профилей: порог, кулдаун, скорость, ETA. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decideProfile, etaMinutes, initialState, speedOf } from "./profile.mts";

const MIN = 60_000;
const now = 1_000 * MIN; // произвольная «сейчас»
const base = { now, idleThresholdSec: 15 * 60, cooldownMs: 15 * MIN, turboEnabled: true };

test("отошёл ≥ порога -> turbo", () => {
  const d = decideProfile({ ...base, idleSec: 16 * 60, state: initialState(now - MIN) });
  assert.equal(d.next, "turbo");
  assert.equal(d.changed, true);
  assert.equal(d.state.profile, "turbo");
});

test("простой меньше порога -> background", () => {
  const d = decideProfile({
    ...base,
    idleSec: 60,
    state: { profile: "turbo", changedAt: now - MIN, lastTurboExitAt: null },
  });
  assert.equal(d.next, "background");
  assert.equal(d.changed, true);
  // выход из turbo фиксирует время для кулдауна
  assert.equal(d.state.lastTurboExitAt, now);
});

test("владелец вернулся -> background НЕМЕДЛЕННО, даже сразу после входа в turbo", () => {
  const st = { profile: "turbo" as const, changedAt: now - 5000, lastTurboExitAt: null };
  const d = decideProfile({ ...base, idleSec: 0, state: st });
  assert.equal(d.next, "background");
  assert.equal(d.changed, true);
});

test("кулдаун: после выхода из turbo в него не входим раньше срока", () => {
  const st = { profile: "background" as const, changedAt: now - 5 * MIN, lastTurboExitAt: now - 5 * MIN };
  const d = decideProfile({ ...base, idleSec: 30 * 60, state: st });
  assert.equal(d.next, "background");
  assert.equal(d.changed, false);
  assert.match(d.reason, /кулдаун/);
});

test("кулдаун истёк -> снова turbo", () => {
  const st = { profile: "background" as const, changedAt: now - 20 * MIN, lastTurboExitAt: now - 16 * MIN };
  const d = decideProfile({ ...base, idleSec: 30 * 60, state: st });
  assert.equal(d.next, "turbo");
  assert.equal(d.changed, true);
  // lastTurboExitAt не перетирается входом
  assert.equal(d.state.lastTurboExitAt, now - 16 * MIN);
});

test("турбо выключен (--turbo off) -> остаёмся в background", () => {
  const d = decideProfile({ ...base, turboEnabled: false, idleSec: 60 * 60, state: initialState(now - MIN) });
  assert.equal(d.next, "background");
  assert.equal(d.changed, false);
  assert.match(d.reason, /выключен/);
});

test("детектор не ответил -> профиль не меняем", () => {
  const st = { profile: "turbo" as const, changedAt: now - MIN, lastTurboExitAt: null };
  const d = decideProfile({ ...base, idleSec: null, state: st });
  assert.equal(d.next, "turbo");
  assert.equal(d.changed, false);
  assert.match(d.reason, /неизвестен/);
});

test("turbo держим, пока владельца нет (без переключений)", () => {
  const st = { profile: "turbo" as const, changedAt: now - 30 * MIN, lastTurboExitAt: null };
  const d = decideProfile({ ...base, idleSec: 40 * 60, state: st });
  assert.equal(d.next, "turbo");
  assert.equal(d.changed, false);
});

test("первый запуск без состояния: простой есть -> turbo, иначе background", () => {
  assert.equal(decideProfile({ ...base, idleSec: 20 * 60, state: null }).next, "turbo");
  assert.equal(decideProfile({ ...base, idleSec: 10, state: null }).next, "background");
});

test("speedOf: скорость по окну сэмплов", () => {
  const t0 = 1000 * MIN;
  const samples = [
    { t: t0, translated: 1000 },
    { t: t0 + 60_000, translated: 1030 },
    { t: t0 + 120_000, translated: 1060 },
  ];
  const sp = speedOf(samples, t0 + 120_000);
  assert.equal(sp.delta, 60);
  assert.equal(Math.round(sp.perMin ?? 0), 30);
});

test("speedOf: одного сэмпла/короткого окна недостаточно", () => {
  const t0 = 1000 * MIN;
  assert.equal(speedOf([{ t: t0, translated: 5 }], t0).perMin, null);
  assert.equal(
    speedOf(
      [
        { t: t0, translated: 5 },
        { t: t0 + 5_000, translated: 9 },
      ],
      t0 + 5_000,
    ).perMin,
    null,
  );
  // старые сэмплы (вне окна) не участвуют
  const old = [
    { t: t0 - 60 * MIN, translated: 0 },
    { t: t0, translated: 100 },
  ];
  assert.equal(speedOf(old, t0).perMin, null);
});

test("speedOf: смена профиля не ломает расчёт (просто окно)", () => {
  const t0 = 1000 * MIN;
  const samples = [
    { t: t0, translated: 100 },
    { t: t0 + 60_000, translated: 130, profile: "turbo" as const },
  ];
  assert.equal(Math.round(speedOf(samples, t0 + 60_000).perMin ?? 0), 30);
});

test("etaMinutes", () => {
  assert.equal(etaMinutes(600, 30), 20);
  assert.equal(etaMinutes(600, null), null);
  assert.equal(etaMinutes(600, 0), null);
});
