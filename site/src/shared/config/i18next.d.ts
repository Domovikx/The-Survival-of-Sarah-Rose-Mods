import "i18next";

import type { MessageKey } from "./i18n.types";

/**
 * TS-мапинг i18n: t() типизирован формой сообщений каталога (src/shared/config/i18n.locales.ts) — обращение к несуществующему ключу (опечатка, удалённый ключ) =
 * ошибка компиляции в `npm run build` / `npm run typecheck`.
 *
 * Разделение труда:
 *   TS    — код -> ключи (compile-time), а также ПОЛНОТА: лист каталога обязан
 *           содержать все языки (Record<Lang, string>), забытый язык не соберётся;
 *   тесты — пустые строки, плейсхолдеры {{name}}, EN-фолбэк в демо-фразах и
 *           мёртвые ключи (e2e/locales.spec.ts).
 */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: Record<MessageKey, string> };
  }
}
