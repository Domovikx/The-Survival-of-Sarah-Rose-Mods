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
    padding: '16px 18px',
  },
  qa: {
    margin: '10px 0',
  },
  q: {
    margin: '0 0 4px',
    fontSize: 16,
  },
  a: {
    margin: 0,
    color: 'var(--muted)',
  },
})

export const Faq = () => {
  const { t } = useTranslation()

  return (
    <Section title={t('faq.title')} testId="faq">
      <div className={stylex.props(styles.panel).className} data-testid="faq-panel">
        <div className={stylex.props(styles.qa).className} data-testid="faq-item-1">
          <h3 className={stylex.props(styles.q).className} data-testid="faq-q-1">
            {t('faq.q1')}
          </h3>
          <p className={stylex.props(styles.a).className} data-testid="faq-a-1">
            {t('faq.a1')}
          </p>
        </div>
        <div className={stylex.props(styles.qa).className} data-testid="faq-item-2">
          <h3 className={stylex.props(styles.q).className} data-testid="faq-q-2">
            {t('faq.q2')}
          </h3>
          <p className={stylex.props(styles.a).className} data-testid="faq-a-2">
            {t('faq.a2')}
          </p>
        </div>
        <div className={stylex.props(styles.qa).className} data-testid="faq-item-3">
          <h3 className={stylex.props(styles.q).className} data-testid="faq-q-3">
            {t('faq.q3')}
          </h3>
          <p className={stylex.props(styles.a).className} data-testid="faq-a-3">
            {t('faq.a3')}{' '}
            <a href={LINKS.license} data-testid="faq-license-link">
              {t('footer.linkLicense')}
            </a>
          </p>
        </div>
        <div className={stylex.props(styles.qa).className} data-testid="faq-item-4">
          <h3 className={stylex.props(styles.q).className} data-testid="faq-q-4">
            {t('faq.q4')}
          </h3>
          <p className={stylex.props(styles.a).className} data-testid="faq-a-4">
            {t('faq.a4')}{' '}
            <a href={LINKS.github} data-testid="faq-github-link">
              {t('footer.linkGithub')}
            </a>
          </p>
        </div>
      </div>
    </Section>
  )
}
