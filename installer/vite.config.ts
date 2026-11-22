import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin";
import { defineConfig } from "vite";

/**
 * Тот же стек, что у лендинга (React 19 + StyleX): интерфейс установщика
 * должен читаться как часть проекта, а не «своё окно». StyleX компилируется
 * в обычный CSS на сборке — в бандле нет рантайм-стилей, только классы.
 */
export default defineConfig({
  plugins: [react(), stylex.vite()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Tauri: фиксированный порт для dev, чтобы открывалось ровно то окно.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: false,
    // Общий снимок чисел лежит выше корня проекта: разрешаем чтение.
    fs: { allow: [".."] },
  },
});
