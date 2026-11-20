import { expect, test } from "@playwright/test";

/**
 * Фикстура релиза: тесты не должны зависеть от GitHub API (в прогоне он отдавал
 * 403 — тест «падал» из-за лимита запросов, а не из-за интерфейса). Размеры
 * нужны настоящие по смыслу: по ним карточка показывает «15.4 MB» и прогресс.
 */
const MB = (n: number): number => Math.round(n * 1024 * 1024);
const LANGS = ["en", "zh", "ru", "es", "pt", "de", "ja", "fr", "pl", "ko", "it"];
const RELEASE = {
  tag_name: "test-release",
  assets: [
    {
      name: "TSSR-AI-Voice-Pack-main.7z",
      size: MB(18),
      browser_download_url: "https://example.invalid/main.7z",
    },
    ...LANGS.map((lang) => ({
      name: `TSSR-AI-Voice-Pack-voice-${lang}.7z`,
      size: MB(17),
      browser_download_url: `https://example.invalid/voice-${lang}.7z`,
    })),
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("https://api.github.com/repos/**", (route) => route.fulfill({ json: RELEASE }));
});

/**
 * Интерфейс установщика (мок-бэкенд): состояния, тумблеры, диалог, локали.
 * Селекторы — только через `data-testid` от ROOT компонента.
 */
test.describe("установщик: интерфейс", () => {
  test("мок: игра найдена, ядро и 11 языков показаны", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("Header--logo")).toBeVisible();
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
    // Клик по ПЛАШКЕ (не только по тумблеру) переключает язык.
    await page.getByTestId("Language--en").click();
    await expect(page.getByTestId("Language--en-meta")).toHaveText("будет удалено");
    await expect(page.getByTestId("Language--en-switch")).not.toBeChecked();
    await expect(apply).toBeEnabled();
  });

  test("Apply с удалением открывает свой диалог; Cancel ничего не меняет", async ({ page }) => {
    await page.goto("/");
    // Клик по ПЛАШКЕ (не только по тумблеру) переключает язык.
    await page.getByTestId("Language--en").click();
    await page.getByTestId("Actions--apply").click();
    await expect(page.getByTestId("Confirm")).toBeVisible();
    await expect(page.getByTestId("Confirm--title")).toContainText("Применить изменения");
    await page.getByTestId("Confirm--cancel").click();
    await expect(page.getByTestId("Confirm")).toHaveCount(0);
    await expect(page.getByTestId("Language--en-meta")).toHaveText("будет удалено");
  });

  test("загрузка: спиннер и полоса привязаны к прогрессу скачивания", async ({ page }) => {
    await page.goto("/");
    // Сначала убираем EN — мок отдаёт прогресс только для установки.
    await page.getByTestId("Language--en").click();
    await page.getByTestId("Actions--apply").click();
    await page.getByTestId("Confirm--ok").click();
    await expect(page.getByTestId("Language--en-meta")).toContainText("MB");

    // Ставим обратно: пока идёт скачивание, виден спиннер, полоса и проценты.
    await page.getByTestId("Language--en").click();
    await page.getByTestId("Actions--apply").click();
    await expect(page.getByTestId("Actions--spinner")).toBeVisible();
    await expect(page.getByTestId("Actions--progress")).toBeVisible();
    await expect(page.getByTestId("Language--en-meta")).toContainText("загрузка");
    await expect(page.getByTestId("Actions--apply")).toContainText("%");

    // После установки лоадер уходит, а карточка снова показывает счёт.
    await expect(page.getByTestId("Language--en-meta")).toContainText("аудиофайлов", { timeout: 20_000 });
    await expect(page.getByTestId("Actions--spinner")).toHaveCount(0);
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
