import { expect, test, type Page } from "@playwright/test";

/**
 * E2E установщика на мок-бэкенде: положительные и отрицательные сценарии,
 * полный цикл «установка → проверка → удаление».
 *
 * Селекторы — только `data-testid` от ROOT компонента. Релиз подменяется
 * фикстурой: живой GitHub API отдаёт 403 при лимите, и тест падал бы из-за
 * сети, а не из-за интерфейса (проверено 2026-11-20).
 */
const MB = (n: number): number => Math.round(n * 1024 * 1024);
const LANGS = ["en", "zh", "ru", "es", "pt", "de", "ja", "fr", "pl", "ko", "it"];
const MAIN = "TSSR-AI-Voice-Pack-main.7z";
const voice = (lang: string): string => `TSSR-AI-Voice-Pack-voice-${lang}.7z`;

const RELEASE = {
  tag_name: "test-release",
  assets: [
    { name: MAIN, size: MB(18), browser_download_url: "https://example.invalid/main.7z" },
    ...LANGS.map((lang) => ({
      name: voice(lang),
      size: MB(17),
      browser_download_url: `https://example.invalid/voice-${lang}.7z`,
    })),
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("https://api.github.com/repos/**", (route) => route.fulfill({ json: RELEASE }));
  await page.goto("/");
});

/** Пустое состояние: удаляем мод целиком (подтверждая диалог). */
const uninstallAll = async (page: Page): Promise<void> => {
  await page.getByTestId("Actions--uninstall").click();
  await expect(page.getByTestId("Confirm")).toBeVisible();
  await page.getByTestId("Confirm--ok").click();
  await expect(page.getByTestId("Components--core-state")).toHaveAttribute("data-state", "absent");
};

/** Дождаться конца работы: спиннер исчез, кнопка снова «Применить изменения». */
const settle = async (page: Page): Promise<void> => {
  await expect(page.getByTestId("Actions--spinner")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("Actions--apply")).toHaveText("Применить изменения");
};

test.describe("установщик: исходное состояние", () => {
  test("игра найдена, основной пак и 11 языков показаны", async ({ page }) => {
    await expect(page.getByTestId("Header--logo")).toBeVisible();
    await expect(page.getByTestId("Header--steam")).toContainText("Steam");
    await expect(page.getByTestId("Game--status")).toHaveText("установлено");
    await expect(page.getByTestId("Game--path")).toContainText("The Survival of Sarah Rose");
    await expect(page.getByTestId("Game--build")).not.toHaveText("—");
    await expect(page.getByTestId("Components--core-state")).toHaveAttribute("data-state", "installed");
    for (const lang of LANGS) {
      await expect(page.getByTestId(`Language--${lang}`)).toBeVisible();
      await expect(page.getByTestId(`Language--${lang}-meta`)).toContainText("аудиофайлов");
    }
    // Ничего не меняли — «Применить» недоступно.
    await expect(page.getByTestId("Actions--apply")).toBeDisabled();
  });
});

test.describe("установщик: единый hover", () => {
  test("индикатор состояния стоит по центру карточки по вертикали", async ({ page }) => {
    const gaps = await page.getByTestId("Language--de").evaluate((card) => {
      const icon = card.querySelector('[data-testid="Language--de-toggle"]');
      if (!icon) throw new Error("индикатор не найден");
      const c = card.getBoundingClientRect();
      const i = icon.getBoundingClientRect();
      return { top: i.top - c.top, bottom: c.bottom - i.bottom };
    });
    // Раньше иконка занимала первую строку сетки и стояла у заголовка.
    expect(Math.abs(gaps.top - gaps.bottom)).toBeLessThan(1.5);
  });

  test("основной пак подсвечивается при наведении так же, как голосовой", async ({ page }) => {
    const border = (id: string): Promise<string> =>
      page.getByTestId(id).evaluate((el) => getComputedStyle(el).borderTopColor);

    const coreIdle = await border("Components--core");
    await page.getByTestId("Components--core").hover();
    // Переход рамки 140 мс: читаем цвет, когда он устоялся.
    await page.waitForTimeout(220);
    const coreHover = await border("Components--core");
    await page.getByTestId("Language--en").hover();
    await page.waitForTimeout(220);
    const langHover = await border("Language--en");

    expect(coreHover).not.toBe(coreIdle); // подсветка вообще есть
    expect(coreHover).toBe(langHover); // и она та же, что у языков
  });
});

test.describe("установщик: положительные сценарии", () => {
  test("полный цикл: пусто → ядро + 2 языка → удаление одного языка", async ({ page }) => {
    await uninstallAll(page);

    // В пустом состоянии каждый язык предлагает установку (размер пака).
    for (const lang of LANGS) {
      await expect(page.getByTestId(`Language--${lang}-meta`)).toHaveText(/MB/);
      await expect(page.getByTestId(`Language--${lang}-switch`)).not.toBeChecked();
    }

    // Выбираем EN и RU: «Применить» становится активным.
    await page.getByTestId("Language--en").click();
    await page.getByTestId("Language--ru").click();
    await expect(page.getByTestId("Language--en-meta")).toHaveText("будет установлено");
    await expect(page.getByTestId("Language--ru-meta")).toHaveText("будет установлено");
    await expect(page.getByTestId("Actions--apply")).toBeEnabled();

    // Ставим (диалог не нужен — только добавление).
    await page.getByTestId("Actions--apply").click();
    await settle(page);

    await expect(page.getByTestId("Components--core-state")).toHaveAttribute("data-state", "installed");
    await expect(page.getByTestId("Language--en-meta")).toContainText("аудиофайлов");
    await expect(page.getByTestId("Language--ru-meta")).toContainText("аудиофайлов");
    // Остальные языки не тронуты.
    await expect(page.getByTestId("Language--de-meta")).toHaveText(/MB/);

    // Снимаем RU: диалог подтверждения → язык снова «можно поставить».
    await page.getByTestId("Language--ru").click();
    await expect(page.getByTestId("Language--ru-meta")).toHaveText("будет удалено");
    await page.getByTestId("Actions--apply").click();
    await expect(page.getByTestId("Confirm")).toBeVisible();
    await page.getByTestId("Confirm--ok").click();
    await settle(page);

    await expect(page.getByTestId("Language--ru-meta")).toHaveText(/MB/);
    await expect(page.getByTestId("Language--en-meta")).toContainText("аудиофайлов");
  });

  test("основной пак: пометка «снять всё», отмена и удаление через «Применить»", async ({ page }) => {
    const core = page.getByTestId("Components--core");
    await expect(core).toHaveAttribute("data-state", "installed");

    // Клик по установленному паку НЕ удаляет сразу — помечает намерение.
    await core.click();
    await expect(core).toHaveAttribute("data-state", "remove");
    await expect(core).toContainText("будет удалено");
    // Языки не могут остаться без пака — все помечены на удаление.
    for (const lang of ["en", "ru", "de"]) {
      await expect(page.getByTestId(`Language--${lang}-meta`)).toHaveText("будет удалено");
    }
    // Кнопка говорит, что произойдёт, а не абстрактное «Применить изменения».
    await expect(page.getByTestId("Actions--apply")).toHaveText("Удалить всё");

    // Повторный клик отменяет намерение — всё снова стоит.
    await core.click();
    await expect(core).toHaveAttribute("data-state", "installed");
    await expect(page.getByTestId("Language--en-meta")).toContainText("аудиофайлов");
    await expect(page.getByTestId("Actions--apply")).toBeDisabled();

    // Пометка → «Применить» → подтверждение → пусто.
    await core.click();
    await page.getByTestId("Actions--apply").click();
    await expect(page.getByTestId("Confirm")).toBeVisible();
    await page.getByTestId("Confirm--ok").click();
    await expect(core).toHaveAttribute("data-state", "absent", { timeout: 20_000 });
    await expect(page.getByTestId("Actions--apply")).toHaveText("Установить основной пак");

    // Из пустого состояния клик по карточке ставит пак.
    await core.click();
    await settle(page);
    await expect(core).toHaveAttribute("data-state", "installed");
  });

  test("удаление мода из полного состояния возвращает пустой экран", async ({ page }) => {
    await uninstallAll(page);

    // Основной пак стал «фоном» (без заливки), «Удалить мод» недоступно.
    const bg = await page.getByTestId("Components--core").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgba(0, 0, 0, 0)");
    await expect(page.getByTestId("Actions--uninstall")).toBeDisabled();

    // Из пустого состояния кнопка не «Применить изменения», а по делу:
    // единственное действие — поставить обязательный основной пак.
    await expect(page.getByTestId("Actions--apply")).toHaveText("Установить основной пак");
    await page.getByTestId("Actions--apply").click();
    await settle(page);
    await expect(page.getByTestId("Components--core-state")).toHaveAttribute("data-state", "installed");
  });

  test("загрузка: спиннер и полоса привязаны к прогрессу скачивания", async ({ page }) => {
    await uninstallAll(page);

    await page.getByTestId("Language--en").click();
    await page.getByTestId("Actions--apply").click();

    // Пока идёт скачивание: спиннер в панели и в карточке, проценты, полоса.
    await expect(page.getByTestId("Actions--spinner")).toBeVisible();
    await expect(page.getByTestId("Actions--progress")).toBeVisible();
    await expect(page.getByTestId("Language--en-meta")).toContainText("загрузка");
    await expect(page.getByTestId("Actions--apply")).toContainText("%");

    await settle(page);
    await expect(page.getByTestId("Language--en-meta")).toContainText("аудиофайлов");
  });

  test("удаление мода показывает лоадер (спиннер + бегущая полоса)", async ({ page }) => {
    await page.getByTestId("Actions--uninstall").click();
    await page.getByTestId("Confirm--ok").click();

    await expect(page.getByTestId("Actions--spinner")).toBeVisible();
    await expect(page.getByTestId("Actions--status")).toContainText("удаление мода");
    await expect(page.getByTestId("Actions--progress")).toBeVisible();
    // Прогресса в байтах при удалении нет — полоса бегущая, а не «0%».
    const anim = await page.getByTestId("Actions--progress-fill").evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).not.toBe("none");

    await expect(page.getByTestId("Components--core-state")).toHaveAttribute("data-state", "absent", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("Actions--spinner")).toHaveCount(0);
  });

  test("удаление языка показывает спиннер и статус с кодом языка", async ({ page }) => {
    await page.getByTestId("Language--ru").click();
    await page.getByTestId("Actions--apply").click();
    await page.getByTestId("Confirm--ok").click();

    await expect(page.getByTestId("Actions--spinner")).toBeVisible();
    await expect(page.getByTestId("Actions--status")).toContainText("удаление RU");
    await expect(page.getByTestId("Language--ru-meta")).toHaveText("будет удалено");

    await settle(page);
    await expect(page.getByTestId("Language--ru-meta")).toHaveText(/MB/);
  });

  test("смена языка переводит и статус внизу (не застывает на прошлом)", async ({ page }) => {
    await expect(page.getByTestId("Actions--status")).toContainText("Основной пак");

    await page.getByTestId("LangSwitcher").click();
    await page.getByTestId("LangSwitcher--de").click();

    await expect(page.getByTestId("Actions--status")).toContainText("Hauptpaket");
    await expect(page.getByTestId("Actions--status")).not.toContainText("Основной пак");
    await expect(page.getByTestId("Components")).toContainText("Was installieren");
  });

  test("смена языка интерфейса меняет подписи", async ({ page }) => {
    await expect(page.getByTestId("Game")).toContainText("Игра");
    await page.getByTestId("LangSwitcher").click();
    await page.getByTestId("LangSwitcher--en").click();
    await expect(page.getByTestId("Game")).toContainText("Game");
    await expect(page.getByTestId("Actions--apply")).toHaveText("Apply changes");
  });
});

test.describe("установщик: отрицательные сценарии", () => {
  test("отмена подтверждения удаления языка ничего не меняет", async ({ page }) => {
    await page.getByTestId("Language--en").click();
    await page.getByTestId("Actions--apply").click();
    await expect(page.getByTestId("Confirm")).toBeVisible();
    await expect(page.getByTestId("Confirm--title")).toContainText("Применить изменения");

    await page.getByTestId("Confirm--cancel").click();
    await expect(page.getByTestId("Confirm")).toHaveCount(0);

    // Язык по-прежнему установлен и всё ещё помечен на удаление.
    await expect(page.getByTestId("Language--en-meta")).toHaveText("будет удалено");
    await expect(page.getByTestId("Components--core-state")).toHaveAttribute("data-state", "installed");
  });

  test("отмена подтверждения удаления мода сохраняет установку", async ({ page }) => {
    await page.getByTestId("Actions--uninstall").click();
    await expect(page.getByTestId("Confirm")).toBeVisible();
    await expect(page.getByTestId("Confirm--title")).toContainText("Sarah Rose");
    await page.getByTestId("Confirm--cancel").click();

    await expect(page.getByTestId("Components--core-state")).toHaveAttribute("data-state", "installed");
    await expect(page.getByTestId("Language--en-meta")).toContainText("аудиофайлов");
    await expect(page.getByTestId("Actions--uninstall")).toBeEnabled();
  });

  test("без изменений «Применить» недоступно, тумблеры не трогают установку", async ({ page }) => {
    const apply = page.getByTestId("Actions--apply");
    await expect(apply).toBeDisabled();

    // Сняли и вернули — изменений нет, кнопка снова недоступна.
    await page.getByTestId("Language--en").click();
    await expect(page.getByTestId("Language--en-meta")).toHaveText("будет удалено");
    await expect(apply).toBeEnabled();
    await page.getByTestId("Language--en").click();
    await expect(page.getByTestId("Language--en-meta")).toContainText("аудиофайлов");
    await expect(apply).toBeDisabled();
  });

  test("во время установки тумблеры заблокированы", async ({ page }) => {
    await uninstallAll(page);
    await page.getByTestId("Language--en").click();
    await page.getByTestId("Actions--apply").click();

    await expect(page.getByTestId("Language--en-switch")).toBeDisabled();
    await expect(page.getByTestId("Actions--uninstall")).toBeDisabled();

    await settle(page);
    await expect(page.getByTestId("Language--en-switch")).toBeEnabled();
  });
});
