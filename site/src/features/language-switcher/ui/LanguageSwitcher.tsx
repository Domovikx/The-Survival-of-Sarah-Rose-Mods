import { useTranslation } from 'react-i18next'

import { setLang, type Lang } from '@/shared/config'
import { Segmented } from '@/shared/ui'

const OPTIONS = [
  { value: 'en', label: 'EN', testId: 'lang-en' },
  { value: 'ru', label: 'RU', testId: 'lang-ru' },
] as const satisfies ReadonlyArray<{ value: Lang; label: string; testId?: string }>

/**
 * Язык: segmented pill EN | RU (стандарт для двух языков — оба варианта видны
 * одновременно; родные названия, без флагов — simplelocalize/weglot best practices).
 */
export const LanguageSwitcher = () => {
  const { i18n, t } = useTranslation()

  return (
    <Segmented
      value={i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'}
      options={[...OPTIONS]}
      onChange={(lang) => setLang(lang)}
      ariaLabel={t('header.langLabel')}
      testId="lang-switcher"
    />
  )
}
