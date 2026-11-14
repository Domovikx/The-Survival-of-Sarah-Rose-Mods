import * as stylex from '@stylexjs/stylex'
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
})

export const Install = () => {
  const { t } = useTranslation()

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
          </li>
        </ol>
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
