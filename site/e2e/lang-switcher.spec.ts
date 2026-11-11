import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "/The-Survival-of-Sarah-Rose-Mods/";
const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "locales");
const LANGS = ["en", "ru", "de", "es", "fr", "it", "ja", "ko", "pl", "pt", "zh"] as const;

const trigger = (page: Page) => page.getByTestId("lang-switcher");
const option = (page: Page, lang: string) => page.getByTestId(`lang-${lang}`);
const menu = (page: Page) => page.getByRole("listbox");

/** Открыть дропдаун переключателя языков. */
const openMenu = async (page: Page) => {
  await trigger(page).click();
  await expect(menu(page)).toBeVisible();
};

/**
 * E2E переключателя языков сайта: 11 языков, родные названия, живая смена
 * без перезагрузки, сохранение выбора, авто-определение по браузеру.
 */
test.describe("язык: переключатель", () => {
  test("дропдаун: 11 языков родными названиями", async ({ page }) => {
    await page.goto(BASE);
    await expect(trigger(page)).toContainText("English");
    await openMenu(page);
    await expect(menu(page).getByRole("option")).toHaveCount(11);
    for (const [lang, label] of [
      ["ru", "Русский"],
      ["de", "Deutsch"],
      ["es", "Español"],
      ["fr", "Français"],
      ["it", "Italiano"],
      ["ja", "日本語"],
      ["ko", "한국어"],
      ["pl", "Polski"],
      ["pt", "Português"],
      ["zh", "中文"],
    ] as const) {
      await expect(option(page, lang)).toContainText(label);
    }
  });

  test("смена языка живая: контент меняется без перезагрузки", async ({ page }) => {
    await page.goto(BASE);
    const titleBefore = await page.title();
    await page.evaluate(() => {
      (window as never as { __noReload?: boolean }).__noReload = true;
    });
    await openMenu(page);
    await option(page, "ru").click();
    await expect(trigger(page)).toContainText("Русский");
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    expect(await page.title()).not.toBe(titleBefore);
    // Маркер пережил смену языка — страница НЕ перезагружалась.
    expect(await page.evaluate(() => (window as never as { __noReload?: boolean }).__noReload)).toBe(true);
  });

  test("выбор сохраняется между визитами", async ({ page }) => {
    await page.goto(BASE);
    await openMenu(page);
    await option(page, "de").click();
    await expect(trigger(page)).toContainText("Deutsch");
    await page.reload();
    await expect(trigger(page)).toContainText("Deutsch");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });

  test("закрытие дропдауна: Escape и клик мимо", async ({ page }) => {
    await page.goto(BASE);
    await openMenu(page);
    await page.keyboard.press("Escape");
    await expect(menu(page)).toBeHidden();
    await openMenu(page);
    await page.mouse.click(10, 400);
    await expect(menu(page)).toBeHidden();
  });

  test("каждый язык матрицы реально подключён (титул из своей локали)", async ({ page }) => {
    // Гард «потеряшек»: незарегистрированная в i18n локаль молча фолбэчится
    // в EN — титул остался бы английским и тест упал бы.
    await page.goto(BASE);
    for (const lang of LANGS) {
      if (lang === "en") continue;
      await openMenu(page);
      await option(page, lang).click();
      await expect(page.locator("html"), `html lang=${lang}`).toHaveAttribute("lang", lang);
      const meta = JSON.parse(readFileSync(join(LOCALES_DIR, `${lang}.json`), "utf8")) as {
        meta: { title: string };
      };
      await expect(page, `title ${lang}`).toHaveTitle(meta.meta.title);
    }
  });

  test.describe("авто-определение по браузеру", () => {
    test.use({ locale: "ru-RU" });
    test("ru-RU → Русский", async ({ page }) => {
      await page.goto(BASE);
      await expect(trigger(page)).toContainText("Русский");
    });
  });

  test.describe("авто-определение: варианты кодов", () => {
    test.use({ locale: "zh-CN" });
    test("zh-CN → 中文 (вариант сводится к базовому коду)", async ({ page }) => {
      await page.goto(BASE);
      await expect(trigger(page)).toContainText("中文");
    });
  });
});
