import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'

/**
 * Визуальное ревью лендинга: снимает галерею скриншотов (сетка) и лайтбокс.
 * Из tools/tmp (временные снимки) перенесён в tools/ при уборке 2026-10-16.
 *
 * Использование (превью должно быть поднято: cd site && npm run preview):
 *   node tools/site_review.mjs [индекс_тюмба=3]
 *
 * Выход: tools/tmp/gallery_grid.png + gallery_lightbox{N}.png.
 * Браузер — локальный Chrome (playwright channel из site/node_modules).
 */
const SITE = 'C:/Program Files (x86)/Steam/steamapps/common/The Survival of Sarah Rose/site'
const OUT = 'C:/Program Files (x86)/Steam/steamapps/common/The Survival of Sarah Rose/tools/tmp'
const BASE = 'http://localhost:4174/The-Survival-of-Sarah-Rose/'

const idx = Number(process.argv[2] ?? 3)
const require = createRequire(`${SITE}/package.json`)
const { chromium } = require('playwright')

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

await page.goto(BASE, { waitUntil: 'networkidle' })
const grid = page.getByTestId('screenshots-grid')
await grid.scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await grid.screenshot({ path: `${OUT}/gallery_grid.png` })

// Лайтбокс на выбранном тюмбе.
await page.getByTestId(`screenshot-img-${idx}`).click()
await page.waitForSelector('[data-testid="lightbox"]')
await page.waitForFunction(() => {
  const img = document.querySelector('[data-testid="lightbox-img"]')
  return img && img.naturalWidth > 0
})
await page.waitForTimeout(350)
await page.screenshot({ path: `${OUT}/gallery_lightbox${idx}.png` })

await browser.close()
console.log(`done: gallery_grid.png + gallery_lightbox${idx}.png`)
