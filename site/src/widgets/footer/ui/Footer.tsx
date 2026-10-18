import * as stylex from '@stylexjs/stylex'
import { useTranslation } from 'react-i18next'

import { LINKS } from '@/shared/config'
import { Container } from '@/shared/ui'

const styles = stylex.create({
  footer: {
    marginTop: 48,
    borderTop: '1px solid var(--border)',
    padding: '18px 0 32px',
    color: 'var(--muted)',
    fontSize: 14,
  },
  links: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    margin: '10px 0 0',
    padding: 0,
    listStyle: 'none',
  },
})

export const Footer = () => {
  const { t } = useTranslation()

  return (
    <footer className={stylex.props(styles.footer).className} data-testid="footer">
      <Container>
        <p data-testid="footer-disclaimer">{t('footer.disclaimer')}</p>
        <ul
          className={stylex.props(styles.links).className}
          aria-label={t('footer.linksLabel')}
          data-testid="footer-links"
        >
          <li>
            <a href={LINKS.github} data-testid="footer-link-github">
              {t('footer.linkGithub')}
            </a>
          </li>
          <li>
            <a href={LINKS.steam} data-testid="footer-link-steam">
              {t('footer.linkSteam')}
            </a>
          </li>
          <li>
            <a href={LINKS.issues} data-testid="footer-link-issues">
              {t('footer.linkIssues')}
            </a>
          </li>
          <li>
            <a href={LINKS.license} data-testid="footer-link-license">
              {t('footer.linkLicense')}
            </a>
          </li>
          <li>
            <b data-testid="footer-age">{t('footer.age')}</b>
          </li>
        </ul>
      </Container>
    </footer>
  )
}
