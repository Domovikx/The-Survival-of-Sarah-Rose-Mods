import { defineConfig } from "@playwright/test";

/**
 * E2E интерфейса установщика в браузере: дев-сервер + мок-бэкенд (`src/mock.ts`).
 * Настоящую установку проверяет `npm run e2e` (собранный exe, `--selftest`).
 */
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:1421",
    channel: "chrome",
    viewport: { width: 1100, height: 800 },
    locale: "ru-RU",
  },
  webServer: {
    command: "npm run dev -- --port 1421 --strictPort",
    url: "http://localhost:1421",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
