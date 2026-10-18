import { expect, test, type Page } from '@playwright/test'

const BASE = '/The-Survival-of-Sarah-Rose-Mods/'

const counter = (page: Page) => page.getByTestId('lightbox-counter')
const dialog = (page: Page) => page.getByTestId('lightbox')

/** Открыть лайтбокс с тюмба i (со свежей страницы). */
const openLightbox = async (page: Page, i = 0) => {
  await page.goto(BASE)
  await page.getByTestId(`screenshot-img-${i}`).click()
  await expect(dialog(page)).toBeVisible()
}

/** Синтетический свайп по оверлею (touchstart → touchend) + «клип после свайпа». */
const swipe = async (page: Page, fromX: number, toX: number) => {
  await page.evaluate(
    ({ fromX, toX }) => {
      const overlay = document.querySelector('[data-testid="lightbox"]')
      if (!overlay) throw new Error('overlay not found')
      const touch = (type: 'touchstart' | 'touchend', x: number) => {
        const t = new Touch({
          identifier: 1,
          target: overlay as Element,
          clientX: x,
          clientY: 300,
          radiusX: 10,
          radiusY: 10,
          force: 1,
        })
        overlay.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            changedTouches: [t],
            touches: type === 'touchend' ? [] : [t],
          }),
        )
      }
      touch('touchstart', fromX)
      touch('touchend', toX)
      // Браузер может досылать click после тача — он должен быть погашен.
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    },
    { fromX, toX },
  )
}

test.describe('скриншоты: сетка', () => {
  test('шесть тюмбов с подписями (EN-локаль по умолчанию)', async ({ page }) => {
    await page.goto(BASE)
    for (let i = 0; i < 6; i++) {
      await expect(page.getByTestId(`screenshot-img-${i}`)).toBeVisible()
    }
    await expect(page.getByTestId('screenshot-caption-0')).toHaveText(
      'Patch page: language, voice, fonts',
    )
    await expect(page.getByTestId('screenshot-caption-1')).toHaveText('Main menu')
    await expect(page.getByTestId('screenshot-caption-5')).toHaveText(
      'Narration over the royal capital',
    )
  })
})

test.describe('скриншоты: лайтбокс', () => {
  test('тюмб открывает диалог: aria, счётчик, картинка, блок прокрутки', async ({
    page,
  }) => {
    await openLightbox(page, 0)

    const role = dialog(page)
    await expect(role).toHaveAttribute('role', 'dialog')
    await expect(role).toHaveAttribute('aria-modal', 'true')
    await expect(counter(page)).toHaveText('1 / 6')
    await expect(page.getByTestId('lightbox-img')).toHaveAttribute(
      'src',
      /language_settings_english\.jpg$/,
    )
    await expect(page.getByTestId('lightbox')).toContainText(
      'Patch page: language, voice, fonts',
    )
    // Прокрутка фона заблокирована (APG: под контентом диалога inert).
    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .toBe('hidden')
    // Фокус вошёл в диалог.
    await expect(page.getByTestId('lightbox')).toBeFocused()
  })

  // РЕГРЕССИЯ v1: клик по ‹ › раньше всплывал до оверлея и закрывал окно.
  test('стрелки листают и НЕ закрывают диалог, с заворотом', async ({ page }) => {
    await openLightbox(page, 0)

    await page.getByTestId('lightbox-next').click()
    await expect(counter(page)).toHaveText('2 / 6')
    await expect(page.getByTestId('lightbox-img')).toHaveAttribute(
      'src',
      /main_menu_english\.jpg$/,
    )
    await expect(dialog(page)).toBeVisible()

    await page.getByTestId('lightbox-next').click()
    await page.getByTestId('lightbox-next').click()
    await expect(counter(page)).toHaveText('4 / 6')

    // Обычный шаг назад.
    await page.getByTestId('lightbox-prev').click()
    await expect(counter(page)).toHaveText('3 / 6')
    await page.getByTestId('lightbox-prev').click()
    await page.getByTestId('lightbox-prev').click()
    await expect(counter(page)).toHaveText('1 / 6')

    // Заворот: с первой по prev → последняя; с последней по next → первая.
    await page.getByTestId('lightbox-prev').click()
    await expect(counter(page)).toHaveText('6 / 6')
    await page.getByTestId('lightbox-next').click()
    await expect(counter(page)).toHaveText('1 / 6')
    await expect(dialog(page)).toBeVisible()
  })

  test('закрытие: × возвращает фокус на тюмб и разблокирует прокрутку', async ({
    page,
  }) => {
    await openLightbox(page, 0)

    await page.getByTestId('lightbox-close').click()
    await expect(dialog(page)).toBeHidden()
    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .toBe('')
    // APG: фокус возвращается на вызвавший элемент.
    await expect
      .poll(() =>
        page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
      )
      .toBe('screenshot-img-0')
  })

  test('закрытие: Escape', async ({ page }) => {
    await openLightbox(page, 1)
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await expect
      .poll(() =>
        page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
      )
      .toBe('screenshot-img-1')
  })

  test('закрытие: клик по фону; клик по картинке — НЕ закрывает', async ({
    page,
  }) => {
    await openLightbox(page, 0)

    // Клик по контенту — не закрывает.
    await page.getByTestId('lightbox-img').click()
    await expect(dialog(page)).toBeVisible()

    // Прямой клик по фону (угол экрана, вне viewer) — закрывает.
    await dialog(page).click({ position: { x: 6, y: 6 } })
    await expect(dialog(page)).toBeHidden()
  })

  test('клавиатура: стрелки листают, Tab зациклен внутри диалога', async ({
    page,
  }) => {
    await openLightbox(page, 0)

    await page.keyboard.press('ArrowRight')
    await expect(counter(page)).toHaveText('2 / 6')
    await page.keyboard.press('ArrowLeft')
    await expect(counter(page)).toHaveText('1 / 6')

    // Фокус-ловушка (APG): close → prev → next → wrap на close.
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('lightbox-close')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('lightbox-prev')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('lightbox-next')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('lightbox-close')).toBeFocused()
    // Shift+Tab из первого — на последний.
    await page.keyboard.press('Shift+Tab')
    await expect(page.getByTestId('lightbox-next')).toBeFocused()
  })

  test('свайп листает, «клик после свайпа» не закрывает, фон потом закрывает', async ({
    page,
  }) => {
    await openLightbox(page, 0)

    // Свайп влево (dx < -50) → вперёд.
    await swipe(page, 400, 200)
    await expect(counter(page)).toHaveText('2 / 6')
    // Синтетический click после свайпа погашен — диалог жив.
    await expect(dialog(page)).toBeVisible()

    // Guard истекает (350мс) — обычный клик по фону снова закрывает.
    await page.waitForTimeout(450)
    await dialog(page).click({ position: { x: 6, y: 6 } })
    await expect(dialog(page)).toBeHidden()
  })

  test('открытие с середины галереи — свой кадр', async ({ page }) => {
    await openLightbox(page, 4)
    await expect(counter(page)).toHaveText('5 / 6')
    await expect(page.getByTestId('lightbox-img')).toHaveAttribute(
      'src',
      /dialogue_3_english\.jpg$/,
    )
  })
})
