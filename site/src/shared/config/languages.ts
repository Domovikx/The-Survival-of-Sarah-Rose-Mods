/** Порядок языков = config/language-priority.json (статистика Steam, окт 2026;
 *  правило проекта — любой список языков идёт в этом порядке, руками не менять).
 *  Отдельный модуль, чтобы не было циклических импортов: его тянут и локали,
 *  и i18n-инициализация. */
export const LANGS = ["en", "zh", "ru", "es", "pt", "de", "ja", "fr", "pl", "ko", "it"] as const;

export type Lang = (typeof LANGS)[number];
