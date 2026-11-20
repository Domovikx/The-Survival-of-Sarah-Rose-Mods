import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { LANG_ORDER } from "./langs.generated";

/**
 * Порядок языков в инсталляторе = `config/language-priority.json`.
 * Источник один (Steam-статистика, решение владельца 2026-11-13): если кто-то
 * поправит список руками, тест упадёт и покажет, что конфиг не перечитан.
 */
describe("порядок языков", () => {
  test("совпадает с config/language-priority.json", () => {
    const configPath = join(process.cwd(), "..", "config", "language-priority.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8")) as { languages: { rank: number; code: string }[] };
    const expected = [...config.languages].sort((a, b) => a.rank - b.rank).map((l) => l.code);
    expect([...LANG_ORDER]).toEqual(expected);
  });

  test("11 языков, без дублей", () => {
    expect(LANG_ORDER.length).toBe(11);
    expect(new Set(LANG_ORDER).size).toBe(11);
  });
});
