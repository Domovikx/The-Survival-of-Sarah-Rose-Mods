import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";

import viteConfig from "./vite.config";

/**
 * Vitest и Playwright живут рядом: юнит-тесты — `src/**\/*.test.*`,
 * e2e — `e2e/**\/*.spec.ts` (их собирает Playwright, не Vitest).
 * Алиас `@/` и плагины берём из боевого vite-конфига, чтобы тесты видели
 * те же пути и ту же компиляцию StyleX.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: { exclude: ["e2e/**", "node_modules/**", "dist/**"] },
  }),
);
