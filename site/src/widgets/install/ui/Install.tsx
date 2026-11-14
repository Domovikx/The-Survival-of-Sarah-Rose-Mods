import * as stylex from '@stylexjs/stylex'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LINKS } from '@/shared/config'
import { Section } from '@/shared/ui'

const styles = stylex.create({
  panel: {
    backgroundColor: 'var(--panel)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 12,
    padding: '16px 22px',
  },
  list: {
    margin: '0 0 12px',
    paddingLeft: 22,
  },
  item: {
    margin: '6px 0',
  },
  note: {
    color: 'var(--muted)',
    fontSize: 14,
    margin: 0,
  },
  ctaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    margin: '4px 0 12px',
  },
  cta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    borderRadius: 10,
    backgroundColor: 'var(--accent)',
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 600,
    textDecoration: 'none',
    transition: 'opacity 150ms ease',
    ':hover': { opacity: 0.9 },
  },
  hint: {
    color: 'var(--muted)',
    fontSize: 13,
    margin: 0,
  },
  where: {
    margin: '0 0 12px',
    fontSize: 14,
  },
  whereTitle: {
    cursor: 'pointer',
    color: 'var(--link)',
    fontWeight: 600,
  },
  whereBody: {
    margin: '8px 0 0',
    color: 'var(--muted)',
    lineHeight: 1.5,
  },
  pathRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  path: {
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
    fontSize: 12,
    padding: '4px 8px',
    borderRadius: 6,
    backgroundColor: 'var(--panel-2)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    wordBreak: 'break-all',
  },
  badgeWrap: {
    margin: '10px 0 0',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  badgeImg: {
    width: '100%',
    maxWidth: 440,
    filter: 'contrast(1.12) brightness(1.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--accent)',
    display: 'block',
  },
  badgeCaption: {
    margin: 0,
    fontSize: 13,
    color: 'var(--muted)',
    maxWidth: 260,
  },
  copy: {
    appearance: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    padding: '5px 10px',
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: 'var(--text)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    transition: 'border-color 150ms ease, color 150ms ease',
    ':hover': { borderColor: 'var(--link)', color: 'var(--link)' },
    ':focus-visible': { outline: '2px solid var(--link)', outlineOffset: 2 },
  },
})

const DEFAULT_GAME_PATH = String.raw`C:\Program Files (x86)\Steam\steamapps\common\The Survival of Sarah Rose`

export const Install = () => {
  const { t, i18n } = useTranslation()
  const [copied, setCopied] = useState(false)
  // Бейдж показываем на русском для RU-аудитории, иначе на китайском (ZHO)
  const shotLang = i18n.language?.startsWith('ru') ? 'russian' : 'chinese'

  return (
    <Section title={t('install.title')} testId="install">
      <div className={stylex.props(styles.panel).className} data-testid="install-panel">
        <ol className={stylex.props(styles.list).className} data-testid="install-steps">
          <li className={stylex.props(styles.item).className} data-testid="install-step-1">
            {t('install.step1')}
          </li>
          <li className={stylex.props(styles.item).className} data-testid="install-step-2">
            {t('install.step2')}
          </li>
          <li className={stylex.props(styles.item).className} data-testid="install-step-3">
            {t('install.step3')}
            <figure className={stylex.props(styles.badgeWrap).className} data-testid="install-badge">
              <img
                className={stylex.props(styles.badgeImg).className}
                src={`${import.meta.env.BASE_URL}shots/badge_${shotLang}.jpg`}
                alt={t('install.badgeHint')}
                loading="lazy"
              />
              <figcaption className={stylex.props(styles.badgeCaption).className}>
                {t('install.badgeHint')}
              </figcaption>
            </figure>
          </li>
        </ol>
        <details className={stylex.props(styles.where).className} data-testid="install-where">
          <summary className={stylex.props(styles.whereTitle).className}>
            {t('install.whereTitle')}
          </summary>
          <p className={stylex.props(styles.whereBody).className}>{t('install.whereText')}</p>
          <div className={stylex.props(styles.pathRow).className}>
            <code className={stylex.props(styles.path).className} data-testid="install-path">
              {DEFAULT_GAME_PATH}
            </code>
            <button
              type="button"
              className={stylex.props(styles.copy).className}
              data-testid="install-copy-path"
              onClick={() => {
                void navigator.clipboard?.writeText(DEFAULT_GAME_PATH).then(
                  () => {
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 1500)
                  },
                  () => setCopied(false),
                )
              }}
            >
              {copied ? '✓' : t('install.whereCopy')}
            </button>
          </div>
        </details>
        <div className={stylex.props(styles.ctaRow).className}>
          <a className={stylex.props(styles.cta).className} href={LINKS.nexus} data-testid="install-cta">
            {t('install.cta')}
          </a>
          <p className={stylex.props(styles.hint).className} data-testid="install-vortex-hint">
            {t('install.vortexHint')}
          </p>
        </div>
        <p className={stylex.props(styles.note).className} data-testid="install-note">
          {t('install.note')}
        </p>
      </div>
    </Section>
  )
}
