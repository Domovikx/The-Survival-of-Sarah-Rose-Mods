import assert from "node:assert/strict";
import { test } from "node:test";

import { packTagFrom, sameStats, type Stats } from "./stats.mts";

const base: Stats = {
  updatedAt: "2026-11-22T00:00:00.000Z",
  packTag: "v2026.11.19-2237",
  langs: ["en", "ru"],
  perLang: {
    en: { po: { filled: 1, total: 2 }, voice: { done: 3, plan: 4 } },
    ru: { po: { filled: 0, total: 2 }, voice: { done: 0, plan: 4 } },
  },
};

test("packTagFrom: вытаскивает тег из конфига сайта", () => {
  assert.equal(packTagFrom('export const PACK = { tag: "v2026.11.19-2237", repo: "x" }'), "v2026.11.19-2237");
  assert.equal(packTagFrom("no tag here"), "");
});

test("sameStats: дата не считается изменением, числа — считаются", () => {
  const later = { ...base, updatedAt: "2026-12-01T00:00:00.000Z" };
  assert.equal(sameStats(base, later), true);
  const changed = structuredClone(base);
  changed.perLang.en!.voice.done = 4;
  assert.equal(sameStats(base, changed), false);
});
