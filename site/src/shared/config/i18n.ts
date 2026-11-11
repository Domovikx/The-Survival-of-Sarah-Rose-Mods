import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from '../../../locales/de.json'
import en from '../../../locales/en.json'
import es from '../../../locales/es.json'
import fr from '../../../locales/fr.json'
import it from '../../../locales/it.json'
import ja from '../../../locales/ja.json'
import ko from '../../../locales/ko.json'
import pl from '../../../locales/pl.json'
import pt from '../../../locales/pt.json'
import ru from '../../../locales/ru.json'
import zh from '../../../locales/zh.json'

export const LANGS = ['en', 'ru', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pl', 'pt', 'zh'] as const
export type Lang = (typeof LANGS)[number]

/** Дефолт — английский (международная аудитория); остальное — авто по языку браузера. */
export const DEFAULT_LANG: Lang = 'en'

/** Родные названия языков (едино с модом zzz_ui; без флагов — best practices). */
export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  ru: 'Русский',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  pl: 'Polski',
  pt: 'Português',
  zh: '中文',
}

import { STORAGE_KEYS } from './constants'

const STORAGE_KEY = STORAGE_KEYS.lang

const detectByBrowser = (): Lang | null => {
  if (typeof navigator === 'undefined') return null
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const l of langs) {
    if (typeof l !== 'string') continue
    const p = l.toLowerCase().split('-')[0]
    if (!p) continue
    // zh-CN / zh-TW -> zh (иероглифические варианты объединяем — как в моде)
    if (p === 'zh') return 'zh'
    if ((LANGS as readonly string[]).includes(p)) return p as Lang
  }
  return null
}

const getInitialLang = (): Lang => {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  if (LANGS.includes(saved as Lang)) return saved as Lang
  return detectByBrowser() ?? DEFAULT_LANG
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
    de: { translation: de },
    es: { translation: es },
    fr: { translation: fr },
    it: { translation: it },
    ja: { translation: ja },
    ko: { translation: ko },
    pl: { translation: pl },
    pt: { translation: pt },
    zh: { translation: zh },
  },
  lng: getInitialLang(),
  fallbackLng: DEFAULT_LANG,
  // Бэст-практики i18next (дока configuration-options): белый список языков,
  // варианты сводятся к базовому коду (zh-CN -> zh, fr-CA -> fr), lookup
  // только по базовому коду — матрица патча живёт на базовых кодах.
  supportedLngs: [...LANGS],
  nonExplicitSupportedLngs: true,
  load: 'languageOnly',
  interpolation: { escapeValue: false },
})

export const setLang = (lang: Lang): void => {
  localStorage.setItem(STORAGE_KEY, lang)
  void i18n.changeLanguage(lang)
}

/** Синхронизация document-меты (title/description/lang) со сменой языка. */
export const syncDocumentMeta = (): void => {
  document.documentElement.lang = i18n.language
  document.title = i18n.t('meta.title')
  const description = document.querySelector('meta[name="description"]')
  if (description) description.setAttribute('content', i18n.t('meta.description'))
}

export { i18n }
