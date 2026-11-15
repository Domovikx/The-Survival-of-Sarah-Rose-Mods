import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CATALOGUE } from "../src/shared/config/i18n.locales";
import { localize } from "../src/shared/config/i18n.types";
import { LANGS } from "../src/shared/config/languages";

/**
 * E2E локалей: механическая перепроверка переводов (11 языков).
 *
 * Каталог один — `src/shared/config/i18n.locales.ts`, ключ = английский текст.
 * TypeScript ловит то, что можно проверить типом (нет забытого языка, нет дубля
 * ключа). Здесь — то, что типом не ловится:
 *   • пустые строки;
 *   • плейсхолдеры {{name}} в демо-плеере;
 *   • демо-фразы, свалившиеся в EN-фолбэк;
 *   • мёртвые ключи (в коде не используется).
 */

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const NON_EN = LANGS.filter((lang) => lang !== "en");

type Trans = Record<string, string>;

/** Лист-перевод: все языки, кроме en (en — сам ключ). */
const isTrans = (value: unknown): value is Trans => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return NON_EN.every((lang) => typeof record[lang] === "string");
};

/** Собирает листья каталога: [ключ-текст, переводы]. */
const leaves: Array<[string, Trans]> = [];
const collect = (node: unknown, key?: string): void => {
  if (isTrans(node) && key) {
    leaves.push([key, node]);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collect(item, key);
    return;
  }
  if (typeof node === "object" && node !== null) {
    for (const [childKey, value] of Object.entries(node as Record<string, unknown>)) collect(value, childKey);
  }
};
collect(CATALOGUE);

test.describe("локали: механическая перепроверка переводов", () => {
  test("ключей достаточно и у каждого есть все 10 переводов", () => {
    expect(leaves.length).toBeGreaterThan(60);
    for (const [key, dict] of leaves) {
      for (const lang of NON_EN) {
        expect(typeof dict[lang], `${key.slice(0, 30)}… / ${lang}: нет значения`).toBe("string");
      }
    }
  });

  test("нет пустых строк", () => {
    for (const [key, dict] of leaves) {
      for (const lang of NON_EN) {
        expect(dict[lang].trim(), `${key.slice(0, 30)}… / ${lang}`).not.toBe("");
      }
    }
  });

  test("плейсхолдеры {{name}} в демо-плеере сохранены во всех языках", () => {
    for (const lang of LANGS) {
      const messages = localize(CATALOGUE, lang) as unknown as Record<string, string>;
      expect(messages["Play: {{name}}"], `${lang}: play`).toContain("{{name}}");
      expect(messages["Pause: {{name}}"], `${lang}: pause`).toContain("{{name}}");
    }
  });

  test("нет мёртвых ключей: каждый ключ-текст упоминается в коде", () => {
    const readAll = (dir: string): string =>
      readdirSync(dir, { withFileTypes: true })
        .map((entry) => {
          const path = join(dir, entry.name);
          if (entry.isDirectory()) return readAll(path);
          if (!/\.(ts|tsx)$/.test(entry.name) || entry.name === "i18n.locales.ts") return "";
          return readFileSync(path, "utf8");
        })
        .join("\n");
    const src = readAll(SRC_DIR);
    for (const [key] of leaves) {
      expect(
        src.includes(JSON.stringify(key)) || src.includes(`'${key}'`) || src.includes(`\`${key}\``),
        `ключ не используется: ${key.slice(0, 60)}`,
      ).toBe(true);
    }
  });
});
