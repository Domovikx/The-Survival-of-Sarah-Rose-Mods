import { defineConfig } from '@playwright/test'

/** Префикс base из vite.config.ts (gh-pages project site). */
const BASE = '/The-Survival-of-Sarah-Rose-Mods/'

/**
 * E2E лайтбокса скриншотов.
 * Браузер: установленный Google Chrome (channel: 'chrome') — без скачивания.
 * Сервер: свежая сборка + vite preview на выделенном порту 4180
 * (4173/4173 заняты рабочими превью — не трогаем).
 */
export default defineConfig({
  testDir: './e2e',
  workers: 2,
  retries: 0,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:4180${BASE}`,
    channel: 'chrome',
    viewport: { width: 1280, height: 800 },
    // Тач-события нужны для теста свайпа.
    hasTouch: true,
    locale: 'en-US',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4180 --strictPort',
    url: `http://localhost:4180${BASE}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
