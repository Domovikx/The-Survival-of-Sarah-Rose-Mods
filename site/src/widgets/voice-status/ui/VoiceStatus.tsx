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
    padding: '16px 18px',
  },
  total: {
    margin: '0 0 8px',
  },
  list: {
    margin: 0,
    paddingLeft: 20,
    color: 'var(--muted)',
  },
})

export const VoiceStatus = () => {
  const { t } = useTranslation()

  return (
    <Section title={t('voice.title')} testId="voice-status">
      <div className={stylex.props(styles.panel).className} data-testid="voice-panel">
        <p className={stylex.props(styles.total).className} data-testid="voice-total">
          <b>{t('voice.total')}</b>
        </p>
        <ul className={stylex.props(styles.list).className} data-testid="voice-list">
          <li data-testid="voice-ru">{t('voice.ru')}</li>
          <li data-testid="voice-en">{t('voice.en')}</li>
          <li data-testid="voice-missing">{t('voice.missing')}</li>
        </ul>
      </div>
    </Section>
  )
}
