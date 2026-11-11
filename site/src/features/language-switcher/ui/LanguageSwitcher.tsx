import * as stylex from '@stylexjs/stylex'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LANGS, LANG_LABELS, setLang, type Lang } from '@/shared/config'

const styles = stylex.create({
  root: { position: 'relative' },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontWeight: 600,
    fontSize: 14,
    color: 'var(--text)',
    cursor: 'pointer',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 8,
    padding: '6px 12px',
    backgroundColor: 'transparent',
    transition: 'border-color 150ms ease, background-color 150ms ease',
    ':hover': { backgroundColor: 'var(--panel-2)', borderColor: 'var(--link)' },
    ':focus-visible': { outline: '2px solid var(--link)', outlineOffset: 2 },
  },
  chevron: { fontSize: 10, opacity: 0.7, transform: 'translateY(1px)' },
  menu: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    minWidth: 168,
    maxHeight: 320,
    overflowY: 'auto',
    zIndex: 30,
    padding: 6,
    margin: 0,
    listStyle: 'none',
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    backgroundColor: 'var(--panel)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
    textAlign: 'left',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text)',
    cursor: 'pointer',
    padding: '8px 10px',
    borderRadius: 6,
    borderWidth: 0,
    backgroundColor: 'transparent',
    ':hover': { backgroundColor: 'var(--panel-2)' },
    ':focus-visible': { outline: '2px solid var(--link)', outlineOffset: -2 },
  },
  itemActive: { color: 'var(--link)', fontWeight: 700 },
  check: { fontSize: 12 },
})

/**
 * Язык: дропдаун с РОДНЫМИ названиями (едино с модом zzz_ui; 11 языков,
 * без флагов). Выбор мгновенный, сохраняется в localStorage (setLang),
 * закрытие по клику мимо / Escape; текущий отмечен галочкой.
 */
export const LanguageSwitcher = () => {
  const { i18n, t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = (LANGS as readonly string[]).includes(i18n.resolvedLanguage ?? '')
    ? (i18n.resolvedLanguage as Lang)
    : 'en'

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div {...stylex.props(styles.root)} ref={rootRef}>
      <button
        type="button"
        {...stylex.props(styles.button)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('header.langLabel')}
        data-testid="lang-switcher"
        onClick={() => setOpen((v) => !v)}
      >
        {LANG_LABELS[current]}
        <span {...stylex.props(styles.chevron)} aria-hidden>
          ▼
        </span>
      </button>
      {open && (
        <ul role="listbox" aria-label={t('header.langLabel')} {...stylex.props(styles.menu)}>
          {LANGS.map((lang) => (
            <li key={lang} role="option" aria-selected={lang === current}>
              <button
                type="button"
                {...stylex.props(styles.item, lang === current && styles.itemActive)}
                data-testid={`lang-${lang}`}
                onClick={() => {
                  setLang(lang)
                  setOpen(false)
                }}
              >
                {LANG_LABELS[lang]}
                {lang === current && (
                  <span {...stylex.props(styles.check)} aria-hidden>
                    ✓
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
