/**
 * Типы общего снимка чисел проекта (см. `config/stats.generated.ts`).
 *
 * Отдельным файлом, а не в сгенерированном: типы импортируют и генератор
 * (`scripts/stats.mts`), и потребители (установщик, скрипты) — так правка
 * формы данных не требует трогать генератор.
 */
export type LangStats = {
  /** Перевод: сколько строк заполнено и сколько всего. */
  po: { filled: number; total: number };
  /** Озвучка: сколько реплик записано и сколько в плане. */
  voice: { done: number; plan: number };
};

export type Stats = {
  /** Когда снят снимок (ISO 8601). */
  updatedAt: string;
  /** Тег релиза, на который ссылается сайт (`PACK.tag`). */
  packTag: string;
  /** Порядок языков — из `config/language-priority.json`. */
  langs: readonly string[];
  perLang: Record<string, LangStats>;
};
