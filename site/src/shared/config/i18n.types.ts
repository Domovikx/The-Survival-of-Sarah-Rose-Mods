/**
 * ТИПЫ И МЕХАНИКА ЛОКАЛЕЙ — рядом с текстами, но отдельно от них.
 *
 * Решение 2026-11-15 (владелец): в `i18n.locales.ts` лежат ТОЛЬКО тексты —
 * вычитка и перевод идут по чистому списку «английский → 10 языков», без
 * служебного кода между строками. Всё, что не текст, живёт здесь.
 *
 * Что здесь:
 *   • типы каталога (`Trans`, `Tree`, `Localized`);
 *   • `dict()` — проверка полноты: забыли язык = ошибка TypeScript в locales;
 *   • `localize()` — разворот каталога в сообщения одного языка (ресурсы
 *     i18next собирает `i18n.ts`, тесты зовут `localize()` напрямую);
 *   • `MessageKey` — юнион ключей; им типизированы `t()` и `tPhrase()`.
 */
import type { CATALOGUE } from "./i18n.locales";
import { LANGS } from "./languages";
import type { Lang } from "./languages";

/** Остальные 10 языков (лист под ключом-текстом). */
export type Trans = Record<Exclude<Lang, "en">, string>;

/** Узел каталога: лист-перевод или контейнер. */
export type Tree = Trans | { readonly [key: string]: Tree };

/** Разворачивает каталог в сообщения одного языка (форма для i18next). */
export type Localized<T> = T extends Trans
  ? string
  : T extends object
    ? { -readonly [K in keyof T]: Localized<T[K]> }
    : never;

/**
 * Обёртка каталога: проверяет, что у КАЖДОГО ключа есть все 10 переводов.
 * Забыли язык — TypeScript ругается здесь же («Types of property … are
 * incompatible»), а не только в компоненте, который дергает t().
 */
export const dict = <T extends Tree>(value: T): T => value;

/** Форма сообщений одного языка — её видит MESSAGES (ресурсы i18next). */
export type Messages = Localized<typeof CATALOGUE>;

/**
 * Ключи каталога плоским юнионом — этим типом типизированы t() и tPhrase()
 * (см. i18next.d.ts). Вложенный `Messages` там не годится: i18next раскручивает
 * его рекурсивно и падает в TS2589 «type instantiation is excessively deep».
 */
export type MessageKey = keyof typeof CATALOGUE;

const NON_EN = LANGS.filter((lang) => lang !== "en");

/** Лист-перевод под ключом-текстом (10 языков, без en). */
const isTrans = (value: unknown): value is Trans => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return NON_EN.every((lang) => typeof record[lang] === "string");
};

/**
 * Разворачивает каталог в сообщения одного языка.
 * `key` — английский текст ключа: для en он и есть перевод (значения нет).
 */
export const localize = <T>(node: T, lang: Lang, key?: string): Localized<T> => {
  if (isTrans(node)) {
    const value = lang === "en" ? (key ?? "") : node[lang as Exclude<Lang, "en">];
    return value as Localized<T>;
  }
  const out: Record<string, unknown> = {};
  for (const [childKey, value] of Object.entries(node as Record<string, unknown>)) {
    out[childKey] = localize(value, lang, childKey);
  }
  return out as Localized<T>;
};
