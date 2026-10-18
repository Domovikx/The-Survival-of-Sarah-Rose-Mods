import * as stylex from '@stylexjs/stylex'
import { useTranslation } from 'react-i18next'

import { LINKS } from '@/shared/config'

const styles = stylex.create({
  hero: {
    padding: '44px 20px 8px',
    textAlign: 'center',
    maxWidth: 920,
    margin: '0 auto',
  },
  title: {
    fontSize: 'clamp(24px, 4.5vw, 36px)',
    lineHeight: 1.25,
    margin: '0 0 12px',
  },
  sub: {
    color: 'var(--muted)',
    margin: '0 auto 16px',
    maxWidth: 660,
  },
  badges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    margin: '14px 0',
  },
  badge: {
    backgroundColor: 'var(--panel-2)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 999,
    padding: '4px 12px',
    fontSize: 13,
    color: 'var(--muted)',
  },
  badgeAge: {
    backgroundColor: 'var(--age-bg)',
    borderColor: 'var(--age-border)',
    color: 'var(--age-fg)',
    fontWeight: 600,
  },
  cta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    margin: '20px 0 8px',
  },
  // Вторичный стиль (ghost) — общий для «Steam» и «Исходники на GitHub»
  steamBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 22px',
    borderRadius: 10,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 16,
    color: 'var(--text)',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    transition: 'border-color 150ms ease, background-color 150ms ease, transform 150ms ease',
    ':hover': {
      backgroundColor: 'var(--panel-2)',
      borderColor: 'var(--link)',
      transform: 'translateY(-1px)',
    },
    ':active': { transform: 'translateY(0)' },
    ':focus-visible': { outline: '2px solid var(--link)', outlineOffset: 2 },
    '@media (max-width: 480px)': {
      fontSize: 14,
      padding: '10px 14px',
    },
  },
  ghostBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '12px 22px',
    borderRadius: 10,
    textDecoration: 'none',
    fontWeight: 600,
    color: 'var(--text)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    transition: 'border-color 150ms ease, background-color 150ms ease, transform 150ms ease',
    ':hover': {
      backgroundColor: 'var(--panel-2)',
      borderColor: 'var(--link)',
      transform: 'translateY(-1px)',
    },
    ':active': { transform: 'translateY(0)' },
    ':focus-visible': { outline: '2px solid var(--link)', outlineOffset: 2 },
  },
  // Единственный акцент в ряду: заливка + glow (стиль перенесён со старого
  // Steam-кнопки, но в фирменном красном — синий остался только у Steam-бренда)
  mainBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '12px 22px',
    borderRadius: 10,
    textDecoration: 'none',
    fontWeight: 700,
    fontSize: 16,
    color: '#fff',
    backgroundColor: 'var(--accent)',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'var(--accent)',
    boxShadow:
      '0 0 0 1px var(--accent), 0 8px 24px color-mix(in srgb, var(--accent) 35%, transparent)',
    transition: 'box-shadow 150ms ease, transform 150ms ease, background-color 150ms ease',
    ':hover': {
      backgroundColor: 'var(--accent-hover)',
      boxShadow:
        '0 0 0 1px var(--accent-hover), 0 10px 30px color-mix(in srgb, var(--accent) 55%, transparent)',
      transform: 'translateY(-1px)',
    },
    ':active': { transform: 'translateY(0) scale(0.99)' },
    // Нейтральное кольцо (WCAG 2.4.11 — на заливке нейтраль читается любого цвета)
    ':focus-visible': { outline: '2px solid var(--text)', outlineOffset: 2 },
    '@media (max-width: 480px)': {
      fontSize: 14,
      padding: '10px 14px',
    },
  },
  hint: {
    color: 'var(--muted)',
    fontSize: 14,
    margin: '6px 0 0',
  },
})

const SteamIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 0 0-10 9.6l5.4 2.2a2.8 2.8 0 0 1 1.6-.5h.2l2.4-3.5v-.1a3.8 3.8 0 1 1 3.8 3.8h-.1l-3.4 2.5v.2a2.8 2.8 0 0 1-5.6.2l-3.8-1.6A10 10 0 1 0 12 2zm-3.2 15.2 1.2.5a2.1 2.1 0 1 0 1.2-2.8l1.3.5a1.6 1.6 0 1 1-1.2 2.9l-2.5-1.1zm7.5-5.9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm0-.9a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2z" />
  </svg>
)

export const Hero = () => {
  const { t } = useTranslation()

  return (
    <section className={stylex.props(styles.hero).className} data-testid="hero">
      <h1 className={stylex.props(styles.title).className} data-testid="hero-title">
        {t('hero.title')}
      </h1>
        <p className={stylex.props(styles.sub).className} data-testid="hero-subtitle">
          {t('hero.subtitle')}
        </p>
        <div className={stylex.props(styles.badges).className} data-testid="hero-badges">
          <span
            className={stylex.props(styles.badge).className}
            data-testid="hero-badge-translate"
          >
            {t('hero.badgeTranslate')}
          </span>
          <span className={stylex.props(styles.badge).className} data-testid="hero-badge-voice">
            {t('hero.badgeVoice')}
          </span>
          <span className={stylex.props(styles.badge).className} data-testid="hero-badge-format">
            {t('hero.badgeFormat')}
          </span>
          <span className={stylex.props(styles.badge).className} data-testid="hero-badge-engine">
            {t('hero.badgeEngine')}
          </span>
          <span
            className={stylex.props(styles.badge, styles.badgeAge).className}
            data-testid="hero-badge-age"
          >
            {t('hero.badgeAge')}
          </span>
        </div>
        <div className={stylex.props(styles.cta).className} data-testid="hero-cta">
          <a
            className={stylex.props(styles.steamBtn).className}
            href={LINKS.steam}
            data-testid="hero-steam"
          >
            <SteamIcon />
            {t('hero.ctaSteam')}
          </a>
          <a
            className={stylex.props(styles.mainBtn).className}
            href={LINKS.zip}
            data-testid="hero-download"
          >
            {t('hero.ctaDownload')}
          </a>
          <a
            className={stylex.props(styles.ghostBtn).className}
            href={LINKS.github}
            data-testid="hero-github"
          >
            {t('hero.ctaGithub')}
          </a>
        </div>
        <p className={stylex.props(styles.hint).className} data-testid="hero-hint">
          {t('hero.installHint')}
        </p>
    </section>
  )
}
