import "i18next";
import type en from "../../../locales/en.json";

/**
 * TS-мапинг i18n: t() типизирован ключами locales/en.json — обращение к
 * несуществующему ключу (опечатка, удалённый ключ) = ошибка компиляции в
 * `npm run build` / `npm run typecheck`. Таблицы-конфиги (`as const`) с
 * ключами проверяются тем же типом.
 *
 * Разделение труда с тестами (e2e/locales.spec.ts):
 *   TS     — код -> ключи en (compile-time);
 *   тесты  — en <-> остальные 10 языков (парити), файл -> i18n (проводка),
 *            ключи en -> код (мёртвые ключи).
 */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
  }
}
