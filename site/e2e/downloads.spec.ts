import { expect, test } from "@playwright/test";

/**
 * Кнопки скачивания: после нажатия ссылка блокируется.
 *
 * Зачем тест: браузер не сообщает сайту о ходе скачивания, поэтому без
 * блокировки человек жмёт повторно и получает пачку одинаковых файлов
 * (сейчас 5–21 МБ, дальше — под гигабайт).
 */

const BASE = "/The-Survival-of-Sarah-Rose-Mods/";
const RELEASE = /releases\/download\/.*\.7z$/;

const countDownloads = async (page: import("@playwright/test").Page): Promise<{ count: () => number }> => {
  let requests = 0;
  // Отдаём пустышку вместо реального 200-мегабайтного архива: браузер всё равно
  // начинает скачивание И остаётся на странице (abort дал бы страницу ошибки).
  await page.route(RELEASE, (route) => {
    requests++;
    void route.fulfill({ status: 200, contentType: "application/octet-stream", body: "x" });
  });
  return { count: () => requests };
};

test.describe("скачивание: защита от повторных кликов", () => {
  test("основной архив: второй клик не запускает вторую закачку", async ({ page }) => {
    await page.goto(BASE);
    const counter = await countDownloads(page);
    const main = page.getByTestId(`Downloads--main`);

    await main.click();
    await expect(main).toHaveAttribute("aria-busy", "true");
    await expect(main).toHaveAttribute("data-state", "pending");
    await expect(page.getByTestId(`Downloads--status`)).toContainText(/download started/i);

    // Повторный клик (в т.ч. форсированный) не должен уйти в сеть.
    await main.click({ force: true });
    await main.dispatchEvent("click");
    await page.waitForTimeout(300);

    expect(counter.count(), "второй клик запустил ещё одну закачку").toBe(1);
  });

  test("голосовые паки: блокируется только нажатый язык", async ({ page }) => {
    await page.goto(BASE);
    const counter = await countDownloads(page);
    const ru = page.getByTestId(`Downloads--voice-ru`);
    const de = page.getByTestId(`Downloads--voice-de`);

    await ru.click();
    await expect(ru).toHaveAttribute("aria-busy", "true");
    await expect(de).toHaveAttribute("aria-busy", "false");

    await ru.click({ force: true });
    await page.waitForTimeout(200);
    expect(counter.count(), "повторный клик по RU ушёл в сеть").toBe(1);

    await de.click();
    await expect(de).toHaveAttribute("aria-busy", "true");
    await page.waitForTimeout(200);
    expect(counter.count(), "другой язык должен качаться отдельно").toBe(2);
  });

  test("после блокировки в браузере не остаётся «мёртвой» ссылки: href на месте", async ({ page }) => {
    await page.goto(BASE);
    await countDownloads(page);
    await page.getByTestId(`Downloads--main`).click();
    await expect(page.getByTestId(`Downloads--main`)).toHaveAttribute("href", /releases\/download\/.*main\.7z$/);
  });
});
