import * as stylex from '@stylexjs/stylex'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { applyTheme, getInitialTheme, type Theme } from '@/shared/lib/theme'

// Морфинг солнце ↔ луна по паттерну web.dev («Building a theme switch
// component»): обе иконки на месте, переключение — rotate+scale, с учётом
// prefers-reduced-motion.
const styles = stylex.create({
  toggle: {
    appearance: 'none',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    backgroundColor: 'var(--panel-2)',
    color: 'var(--text)',
    borderRadius: '50%',
    width: 36,
    height: 36,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    position: 'relative',
    transition: 'border-color 150ms ease, background-color 150ms ease, transform 150ms ease',
    ':hover': {
      borderColor: 'var(--link)',
      backgroundColor: 'var(--panel)',
    },
    ':active': { transform: 'scale(0.95)' },
    ':focus-visible': { outline: '2px solid var(--link)', outlineOffset: 2 },
  },
  iconBox: {
    position: 'relative',
    width: 18,
    height: 18,
  },
  icon: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 250ms ease, opacity 250ms ease',
  },
  iconHidden: {
    transform: 'rotate(90deg) scale(0.4)',
    opacity: 0,
  },
  reducedMotion: {
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
})

const SunIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
  </svg>
)

const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 0 1-4.4 2.26 5.4 5.4 0 0 1-3.16-9.88A9 9 0 0 0 12 3z" />
  </svg>
)

/** Тема: круглая кнопка с морфингом ☀ (светлая) ↔ 🌙 (тёмная, дефолт проекта). */
export const ThemeToggle = () => {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const isDark = theme === 'dark'

  const handleToggle = () => {
    const next: Theme = isDark ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  return (
    <button
      type="button"
      className={stylex.props(styles.toggle, styles.reducedMotion).className}
      aria-label={t('header.themeLabel')}
      aria-pressed={isDark}
      data-testid="theme-switch"
      onClick={handleToggle}
    >
      <span className={stylex.props(styles.iconBox).className}>
        <span
          className={stylex.props(styles.icon, isDark && styles.iconHidden).className}
        >
          <SunIcon />
        </span>
        <span
          className={stylex.props(styles.icon, !isDark && styles.iconHidden).className}
        >
          <MoonIcon />
        </span>
      </span>
    </button>
  )
}
