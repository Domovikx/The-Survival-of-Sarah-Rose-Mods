import * as stylex from '@stylexjs/stylex'
import { useTranslation } from 'react-i18next'

import { LANGS } from '@/shared/config/i18n'
import { Section } from '@/shared/ui'

/** Постоянный канал прямых ссылок: ассеты версии в GitHub-релизе.
 *  Обновляется вместе с релизом (тег = версия пакета). */
const RELEASE_BASE = 'https://github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods/releases/download/v2026.11.15-0008'

const asset = (name: string): string => `${RELEASE_BASE}/TSSR-AI-Voice-Pack-${name}.7z`

const styles = stylex.create({
  panel: {
    backgroundColor: 'var(--panel)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 12,
    padding: '16px 22px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  lead: { margin: 0, color: 'var(--muted)' },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  mainBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '11px 18px',
    borderRadius: 10,
    textDecoration: 'none',
    fontWeight: 700,
    fontSize: 16,
    color: '#fff',
    backgroundColor: 'var(--accent)',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'var(--accent)',
    transition: 'transform 120ms ease, filter 120ms ease',
    ':hover': { filter: 'brightness(1.08)' },
    ':active': { transform: 'translateY(1px)' },
    ':focus-visible': { outline: '2px solid var(--link)', outlineOffset: 2 },
  },
  chipsLabel: { margin: 0, color: 'var(--muted)', fontSize: 14 },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 12px',
    borderRadius: 999,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text)',
    backgroundColor: 'var(--panel-2)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    transition: 'border-color 150ms ease, color 150ms ease',
    ':hover': { borderColor: 'var(--link)', color: 'var(--link)' },
    ':focus-visible': { outline: '2px solid var(--link)', outlineOffset: 2 },
  },
  hint: { margin: 0, color: 'var(--muted)', fontSize: 14 },
  note: { margin: 0, color: 'var(--muted)', fontSize: 13, fontStyle: 'italic' },
})

export const Downloads = () => {
  const { t } = useTranslation()

  return (
    <Section title={t('download.title')} testId="downloads">
      <div className={stylex.props(styles.panel).className} data-testid="downloads-panel">
        <p className={stylex.props(styles.lead).className}>{t('download.lead')}</p>

        <div className={stylex.props(styles.row).className}>
          <a
            className={stylex.props(styles.mainBtn).className}
            href={asset('main')}
            data-testid="download-main"
            rel="noopener"
          >
            {t('download.main')}
          </a>
          <span className={stylex.props(styles.hint).className}>{t('download.mainHint')}</span>
        </div>

        <div>
          <p className={stylex.props(styles.chipsLabel).className}>{t('download.voiceLabel')}</p>
          <div className={stylex.props(styles.row).className}>
            {LANGS.map((code) => (
              <a
                key={code}
                className={stylex.props(styles.chip).className}
                href={asset(`voice-${code}`)}
                data-testid={`download-voice-${code}`}
                rel="noopener"
              >
                {code.toUpperCase()}
              </a>
            ))}
          </div>
        </div>

        <p className={stylex.props(styles.hint).className}>{t('download.install')}</p>
        <p className={stylex.props(styles.note).className}>{t('download.note')}</p>
      </div>
    </Section>
  )
}
