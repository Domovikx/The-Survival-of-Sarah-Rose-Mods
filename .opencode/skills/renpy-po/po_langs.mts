/**
 * po_langs.mts — точка входа языковых профилей (тонкий re-export).
 * Профили атомизированы 2026-10-26: po_langs/<code>.mts — по файлу на язык.
 */
export { LANGS, langProfile } from "./po_langs/index.mts";
export type { LangProfile } from "./po_langs/index.mts";
