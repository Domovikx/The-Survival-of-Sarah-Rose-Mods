import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * E2E локалей сайта: механическая перепроверка всех 11 переводов.
 * Регресс, который эти тесты ловят уже случался: демо-фразы сваливались в
 * EN-фолбэк (po без перевода), и часть замен в i18n-инфре терялась молча.
 */

const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "locales");
const LANGS = ["en", "ru", "de", "es", "fr", "it", "ja", "ko", "pl", "pt", "zh"];

type Json = { [k: string]: Json | string | Json[] | string[] };

const load = (lang: string): Json => JSON.parse(readFileSync(join(LOCALES_DIR, `${lang}.json`), "utf8")) as Json;

/** Плоский список ключей (массивы — листья: сверяем отдельно). */
const keys = (o: Json, prefix = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    v !== null && typeof v === "object" && !Array.isArray(v) ? keys(v as Json, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

const get = (o: Json, path: string): unknown => path.split(".").reduce<unknown>((a, k) => (a as Json)?.[k], o);

test.describe("локали: механическая перепроверка переводов", () => {
  test("файлы всех 11 языков на месте и валидны", () => {
    const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".json"));
    for (const lang of LANGS) expect(files).toContain(`${lang}.json`);
  });

  test("в locales/ нет файлов вне матрицы языков (лишние/потерянные)", () => {
    const files = readdirSync(LOCALES_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    expect(files).toEqual([...LANGS].sort());
  });

  test("парити ключей: каждая локаль = набор ключей en", () => {
    const ref = keys(load("en")).sort();
    for (const lang of LANGS) {
      expect(keys(load(lang)).sort(), `ключи локали ${lang}`).toEqual(ref);
    }
  });

  test("нет пустых строк", () => {
    for (const lang of LANGS) {
      const j = load(lang);
      for (const k of keys(j)) {
        const v = get(j, k);
        if (typeof v === "string") expect(v.trim(), `${lang}: ${k}`).not.toBe("");
      }
    }
  });

  test("плейсхолдеры {{name}} в play/pause сохранены", () => {
    for (const lang of LANGS) {
      const j = load(lang);
      expect(get(j, "demo.play") as string, `${lang}: demo.play`).toContain("{{name}}");
      expect(get(j, "demo.pause") as string, `${lang}: demo.pause`).toContain("{{name}}");
    }
  });

  test("демо-фразы не свалены в EN-фолбэк (кроме en)", () => {
    const en = load("en") as { demo: { phrases: Array<{ text: string }> } };
    for (const lang of LANGS) {
      if (lang === "en") continue;
      const j = load(lang) as typeof en;
      expect(j.demo.phrases, `${lang}: число фраз`).toHaveLength(en.demo.phrases.length);
      j.demo.phrases.forEach((p, i) => {
        expect(p.text, `${lang}: фраза #${i + 1} = EN-фолбэк`).not.toBe(en.demo.phrases[i]!.text);
        expect(p.text.trim(), `${lang}: фраза #${i + 1} пустая`).not.toBe("");
      });
    }
  });
});
