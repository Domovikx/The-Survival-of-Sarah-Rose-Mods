import { expect, test } from "@playwright/test";

/**
 * Интерфейс установщика (мок-бэкенд): состояния, тумблеры, диалог, локали.
 * Селекторы — только через `data-testid` от ROOT компонента.
 */
test.describe("установщик: интерфейс", () => {
  test("мок: игра найдена, ядро и 11 языков показаны", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("Game")).toBeVisible();
    await expect(page.getByTestId("Game--status")).toHaveText("установлено");
    await expect(page.getByTestId("Game--path")).toContainText("The Survival of Sarah Rose");
    await expect(page.getByTestId("Components--core-badge")).toHaveText("установлено");
    for (const lang of ["en", "ru", "zh", "es", "pt", "de", "ja", "fr", "pl", "ko", "it"]) {
      await expect(page.getByTestId(`Language--${lang}`)).toBeVisible();
    }
  });

  test("выключение языка: «будет удалено» и кнопка Apply активна", async ({ page }) => {
    await page.goto("/");
    const apply = page.getByTestId("Actions--apply");
    await expect(apply).toBeDisabled();
    await page.getByTestId("Language--en-toggle").click();
    await expect(page.getByTestId("Language--en-meta")).toHaveText("будет удалено");
    await expect(page.getByTestId("Language--en-switch")).not.toBeChecked();
    await expect(apply).toBeEnabled();
  });

  test("Apply с удалением открывает свой диалог; Cancel ничего не меняет", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("Language--en-toggle").click();
    await page.getByTestId("Actions--apply").click();
    await expect(page.getByTestId("Confirm")).toBeVisible();
    await expect(page.getByTestId("Confirm--title")).toContainText("Применить изменения");
    await page.getByTestId("Confirm--cancel").click();
    await expect(page.getByTestId("Confirm")).toHaveCount(0);
    await expect(page.getByTestId("Language--en-meta")).toHaveText("будет удалено");
  });

  test("смена языка интерфейса меняет подписи", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("Game")).toContainText("Игра");
    await page.getByTestId("LangSwitcher").click();
    await page.getByTestId("LangSwitcher--en").click();
    await expect(page.getByTestId("Game")).toContainText("Game");
    await expect(page.getByTestId("Actions--apply")).toHaveText("Apply changes");
  });
});
