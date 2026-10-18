import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import stylex from '@stylexjs/unplugin'
import { defineConfig } from 'vite'

export default defineConfig({
  // Базовый путь для GitHub Pages (project site). Локально `npm run dev` — тоже работает.
  base: '/The-Survival-of-Sarah-Rose-Mods/',
  // useCSSLayers: правила stylex — в @layer (объявление слоёв первым строком
  // в app/styles/global.css) — как в kubica, проверено там же.
  plugins: [react(), stylex.vite({ useCSSLayers: true })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
