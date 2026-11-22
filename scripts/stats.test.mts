import assert from "node:assert/strict";
import { test } from "node:test";

import type { Stats } from "../config/stats.types.ts";
import { packTagFrom, renderStats } from "./stats.mts";

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

test("renderStats: валидный TS-модуль с типом и данными", () => {
  const text = renderStats(base);
  assert.match(text, /import type \{ Stats \} from "\.\/stats\.types\.ts";/);
  assert.match(text, /export const STATS = \{/);
  assert.match(text, /as const satisfies Stats;/);
  assert.match(text, /"en": /);
  // Дата попадает в снимок (её видно на сайте как «снимок от …»).
  assert.match(text, /"updatedAt": "2026-11-22T00:00:00\.000Z"/);
});
