import { STORAGE_KEYS } from '@/shared/config'

export type Theme = 'light' | 'dark'

/** Начальная тема: localStorage → prefers-color-scheme → dark (дефолт проекта). */
export const getInitialTheme = (): Theme => {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.theme) : null
  if (stored === 'dark' || stored === 'light') return stored
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  ) {
    return 'light'
  }
  return 'dark'
}

export const applyTheme = (theme: Theme): void => {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(STORAGE_KEYS.theme, theme)
}
