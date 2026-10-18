import * as stylex from '@stylexjs/stylex'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/features/language-switcher'
import { ThemeToggle } from '@/features/theme-toggle'
import { LINKS } from '@/shared/config'
import { Container } from '@/shared/ui'

const styles = stylex.create({
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    backdropFilter: 'blur(8px)',
    backgroundColor: 'color-mix(in srgb, var(--bg) 82%, transparent)',
    borderBottom: '1px solid var(--border)',
  },
  inner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    paddingTop: 10,
    paddingBottom: 10,
  },
  brand: {
    fontWeight: 700,
    textDecoration: 'none',
    color: 'var(--text)',
    marginRight: 'auto',
  },
  // Вторичный стиль (ghost) — тот же, что у GitHub-ссылки
  steamLink: {
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 14,
    color: 'var(--link)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 8,
    padding: '6px 12px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    transition: 'border-color 150ms ease, background-color 150ms ease',
    ':hover': {
      backgroundColor: 'var(--panel-2)',
      borderColor: 'var(--link)',
    },
    ':focus-visible': { outline: '2px solid var(--link)', outlineOffset: 2 },
  },
  ghostLink: {
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 14,
    color: 'var(--link)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 8,
    padding: '6px 12px',
    transition: 'border-color 150ms ease, background-color 150ms ease',
    ':hover': {
      backgroundColor: 'var(--panel-2)',
      borderColor: 'var(--link)',
    },
    ':focus-visible': { outline: '2px solid var(--link)', outlineOffset: 2 },
  },
})

const SteamIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 0 0-10 9.6l5.4 2.2a2.8 2.8 0 0 1 1.6-.5h.2l2.4-3.5v-.1a3.8 3.8 0 1 1 3.8 3.8h-.1l-3.4 2.5v.2a2.8 2.8 0 0 1-5.6.2l-3.8-1.6A10 10 0 1 0 12 2zm-3.2 15.2 1.2.5a2.1 2.1 0 1 0 1.2-2.8l1.3.5a1.6 1.6 0 1 1-1.2 2.9l-2.5-1.1zm7.5-5.9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm0-.9a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2z" />
  </svg>
)

export const Header = () => {
  const { t } = useTranslation()

  return (
    <header className={stylex.props(styles.header).className} data-testid="header">
      <Container>
        <div className={stylex.props(styles.inner).className} data-testid="header-inner">
          <a
            className={stylex.props(styles.brand).className}
            href={LINKS.github}
            data-testid="header-brand"
          >
            {t('header.brand')}
          </a>
          <a
            className={stylex.props(styles.steamLink).className}
            href={LINKS.steam}
            data-testid="steam-link"
          >
            <SteamIcon />
            {t('header.steam')}
          </a>
          <a
            className={stylex.props(styles.ghostLink).className}
            href={LINKS.github}
            data-testid="header-github"
          >
            {t('header.github')}
          </a>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </Container>
    </header>
  )
}
