import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { App } from "./App";
import { initLang } from "./i18n";

/**
 * Смоук-тест разметки: приложение рендерится без DOM и без Tauri и содержит
 * ключевые блоки (шапка, игра, компоненты, нижняя панель действий).
 * Логика (план, diff, форматтеры) покрыта отдельными тестами.
 */
describe("App", () => {
  test("рендерится в строку: шапка, игра, компоненты, действия", () => {
    initLang("ru-RU");
    const html = renderToString(<App />);
    expect(html).toContain("TSSR AI Voice Pack");
    expect(html).toContain("Игра");
    expect(html).toContain("Компоненты");
    expect(html).toContain("Применить изменения");
    expect(html).toContain("Удалить мод");
    // 11 языков озвучки — по флагу на каждого (SSR может продублировать атрибут)
    const flags = new Set(html.match(/\/flags\/[a-z]{2}\.svg/g) ?? []);
    expect(flags.size).toBe(11);
  });
});
