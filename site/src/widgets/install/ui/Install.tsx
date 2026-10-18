import * as stylex from '@stylexjs/stylex'
import { useTranslation } from 'react-i18next'

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
    margin: '0 0 8px',
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
        <p className={stylex.props(styles.note).className} data-testid="install-note">
          {t('install.note')}
        </p>
      </div>
    </Section>
  )
}
