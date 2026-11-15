import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { STORAGE_KEYS } from "./constants";
import { CATALOGUE } from "./i18n.locales";
import { localize } from "./i18n.types";
import type { Localized } from "./i18n.types";
import { LANGS } from "./languages";
import type { Lang } from "./languages";

export type { Lang };
export { LANGS };

/** Дефолт — английский (международная аудитория); остальное — авто по языку браузера. */
export const DEFAULT_LANG: Lang = "en";

/** Родные названия языков (едино с модом zzz_ui; без флагов — best practices). */
export const LANG_LABELS: Record<Lang, string> = {
  en: "English",
  ru: "Русский",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  pl: "Polski",
  pt: "Português",
  zh: "中文",
};

const STORAGE_KEY = STORAGE_KEYS.lang;

const detectByBrowser = (): Lang | null => {
  if (typeof navigator === "undefined") return null;
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const l of langs) {
    if (typeof l !== "string") continue;
    const p = l.toLowerCase().split("-")[0];
    if (!p) continue;
    // zh-CN / zh-TW -> zh (иероглифические варианты объединяем — как в моде)
    if (p === "zh") return "zh";
    if ((LANGS as readonly string[]).includes(p)) return p as Lang;
  }
  return null;
};

const getInitialLang = (): Lang => {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  if (LANGS.includes(saved as Lang)) return saved as Lang;
  return detectByBrowser() ?? DEFAULT_LANG;
};

/** Форма сообщений одного языка — её видит MESSAGES (ресурсы i18next). */
export type Messages = Localized<typeof CATALOGUE>;

/**
 * Ключи каталога плоским юнионом: этим типом типизированы t() и tPhrase()
 * (см. i18next.d.ts). Вложенный `Messages` там не годится — i18next раскручивает
 * его рекурсивно и падает в TS2589 «type instantiation is excessively deep».
 */
export type MessageKey = keyof typeof CATALOGUE;

/** Ресурсы i18next: язык -> сообщения (разворот каталога из i18n.locales.ts). */
export const MESSAGES = Object.fromEntries(LANGS.map((lang) => [lang, localize(CATALOGUE, lang)])) as Record<
  Lang,
  Messages
>;

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(LANGS.map((lang) => [lang, { translation: MESSAGES[lang] }])),
  // Ключ = английский текст, а в текстах есть точки: иначе i18next резал бы
  // ключ по точке и искал вложенный путь (решение 2026-11-15).
  keySeparator: false,
  nsSeparator: false,
  lng: getInitialLang(),
  fallbackLng: DEFAULT_LANG,
  // Бэст-практики i18next (дока configuration-options): белый список языков,
  // варианты сводятся к базовому коду (zh-CN -> zh, fr-CA -> fr), lookup
  // только по базовому коду — матрица патча живёт на базовых кодах.
  supportedLngs: [...LANGS],
  nonExplicitSupportedLngs: true,
  load: "languageOnly",
  interpolation: { escapeValue: false },
});

export const setLang = (lang: Lang): void => {
  localStorage.setItem(STORAGE_KEY, lang);
  void i18n.changeLanguage(lang);
};

/** Синхронизация document-меты (title/description/lang) со сменой языка. */
export const syncDocumentMeta = (): void => {
  document.documentElement.lang = i18n.language;
  document.title = tPhrase("The Survival of Sarah Rose — AI Voice Pack + 11 Languages");
  const description = document.querySelector('meta[name="description"]');
  if (description)
    description.setAttribute(
      "content",
      tPhrase(
        "Unofficial fan patch: demo AI voice acting in 11 languages plus translations into 11 (Russian complete; the others cover the intro up to the first choice). Free, 18+.",
      ),
    );
};

/**
 * Перевод строки, пришедшей из ДАННЫХ (демо-манифест): ключ = сам английский
 * текст. В отличие от t(), принимает переменную — но только если это ключ
 * каталога: опечатка или удалённый ключ = ошибка компиляции.
 */
// Каст объекта, а не функции: `i18n.t` типизирован объединением 86 длинных
// литералов, и любое его упоминание в обёртке упирается в TS2589
// («type instantiation is excessively deep»).
const translateRaw = (i18n as unknown as { t: (key: string, vars?: Record<string, string>) => string }).t;

/** Перевод текста-ключа; `vars` — подстановки вида `{{name}}`. */
export const tPhrase = (text: MessageKey, vars?: Record<string, string>): string => translateRaw(text, vars);

export { i18n };
