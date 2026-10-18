import * as stylex from '@stylexjs/stylex'
import { useTranslation } from 'react-i18next'

import { Section } from '@/shared/ui'

const styles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: 14,
  },
  card: {
    backgroundColor: 'var(--panel)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 12,
    padding: '16px 18px',
  },
  cardTitle: {
    fontSize: 17,
    margin: '0 0 6px',
  },
  cardText: {
    margin: 0,
    color: 'var(--muted)',
  },
})

const CARDS = [
  { icon: '🌐', titleKey: 'features.translateTitle', textKey: 'features.translateText', testId: 'features-card-translate' },
  { icon: '🎙', titleKey: 'features.voiceTitle', textKey: 'features.voiceText', testId: 'features-card-voice' },
  { icon: '🎭', titleKey: 'features.emotionTitle', textKey: 'features.emotionText', testId: 'features-card-emotion' },
  { icon: '🗣', titleKey: 'features.voicesTitle', textKey: 'features.voicesText', testId: 'features-card-voices' },
] as const

export const Features = () => {
  const { t } = useTranslation()

  return (
    <Section title={t('features.title')} testId="features">
      <div className={stylex.props(styles.grid).className} data-testid="features-grid">
        {CARDS.map((card) => (
          <div
            key={card.titleKey}
            className={stylex.props(styles.card).className}
            data-testid={card.testId}
          >
            <h3
              className={stylex.props(styles.cardTitle).className}
              data-testid={`${card.testId}-title`}
            >
              {card.icon} {t(card.titleKey)}
            </h3>
            <p className={stylex.props(styles.cardText).className} data-testid={`${card.testId}-text`}>
              {t(card.textKey)}
            </p>
          </div>
        ))}
      </div>
    </Section>
  )
}
