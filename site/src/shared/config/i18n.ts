import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../../locales/en.json'
import ru from '../../../locales/ru.json'

export const LANGS = ['en', 'ru'] as const
export type Lang = (typeof LANGS)[number]

/** Дефолт — английский (международная аудитория); русский — авто по Accept-Language. */
export const DEFAULT_LANG: Lang = 'en'

import { STORAGE_KEYS } from './constants'

const STORAGE_KEY = STORAGE_KEYS.lang

const detectRuByBrowser = (): boolean => {
  if (typeof navigator === 'undefined') return false
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
  return langs.some((l) => typeof l === 'string' && l.toLowerCase().startsWith('ru'))
}

const getInitialLang = (): Lang => {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  if (LANGS.includes(saved as Lang)) return saved as Lang
  return detectRuByBrowser() ? 'ru' : DEFAULT_LANG
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
  },
  lng: getInitialLang(),
  fallbackLng: DEFAULT_LANG,
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
