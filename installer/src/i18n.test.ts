import { describe, expect, test } from "vitest";

import { CATALOGUE, LANG_LABELS, UI_LANGS, initLang, t } from "./i18n";

/**
 * Полнота локалей инсталлятора: тот же страж, что на сайте. Ключ = английский
 * текст; у каждого ключа обязаны быть все 10 переводов и те же `{{переменные}}`.
 */
const NON_EN = UI_LANGS.filter((l) => l !== "en");

describe("локали инсталлятора", () => {
  test("у каждого ключа есть все 10 переводов и они непустые", () => {
    const bad: string[] = [];
    for (const [key, trans] of Object.entries(CATALOGUE)) {
      for (const lang of NON_EN) {
        const value = trans[lang];
        if (typeof value !== "string" || !value.trim()) bad.push(`${key.slice(0, 40)}… / ${lang}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test("подстановки {{var}} не теряются в переводах", () => {
    const placeholders = (text: string): string[] => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!).sort();
    const bad: string[] = [];
    for (const [key, trans] of Object.entries(CATALOGUE)) {
      const base = placeholders(key);
      if (!base.length) continue;
      for (const lang of NON_EN) {
        if (placeholders(trans[lang]).join() !== base.join()) bad.push(`${key.slice(0, 40)}… / ${lang}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test("t() подставляет значения и уважает выбранный язык", () => {
    // Системная локаль ru-RU → интерфейс стартует по-русски (без localStorage).
    expect(initLang("ru-RU")).toBe("ru");
    expect(t("Game")).toBe("Игра");
    expect(t("Install selected ({{n}})", { n: 3 })).toContain("3");
  });

  test("все 11 языков имеют подпись в переключателе", () => {
    for (const lang of UI_LANGS) expect(LANG_LABELS[lang]?.length).toBeGreaterThan(1);
  });
});
