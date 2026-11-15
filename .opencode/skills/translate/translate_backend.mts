/**
 * Модель перевода — ОТДЕЛЬНАЯ от пульта бэкендов.
 *
 * Решение владельца 2026-11-03 и журнал `tasks/2026-11-03-index-translate-9b.md`:
 * переводы делает СПЕЦИАЛЬНАЯ переводческая модель **Index-Translate-9B**
 * (IndexTeam, база Qwen3.5, 150 языков, instTrans Quality 0.247 → 0.677 против
 * базы) в LM Studio на :1234. В реестр пульта её НЕ кладём (там дефолт
 * qwen3.5-9b для эмоций/чата) — раньше из-за этого перевод «следовал» за
 * активным бэкендом: 2026-11-15 прогон zh на 94 % прошёл на общей
 * Qwen3.6-35B из Strata, хотя договорились о переводческой модели.
 *
 * Теперь пульт на перевод НЕ влияет: по умолчанию — переводческая модель.
 * Осознанно переопределить (эксперимент): `--base-url` / `--model` или env
 * `TSSR_LLM_URL` / `TSSR_LLM_MODEL`; в шапке прогона появится предупреждение.
 */

/** Дефолт перевода: LM Studio + Index-Translate-9B. */
export const TRANSLATE_BACKEND = { url: "http://127.0.0.1:1234", model: "index-translate-9b" } as const;

export type TranslateBackend = {
  url: string;
  model: string;
  /** true — модель/адрес переопределены (не переводческая модель). */
  overridden: boolean;
};

/**
 * Разрешает бэкенд перевода: CLI > env > дефолт перевода.
 * Пульт (`scripts/llm_backend.mts`) сюда не подмешивается намеренно.
 */
export const resolveTranslateBackend = (
  argv: readonly string[],
  env: Record<string, string | undefined>,
): TranslateBackend => {
  const flag = (name: string): string | undefined => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  const url = flag("base-url") ?? env.TSSR_LLM_URL ?? TRANSLATE_BACKEND.url;
  const model = flag("model") ?? env.TSSR_LLM_MODEL ?? TRANSLATE_BACKEND.model;
  return { url, model, overridden: model !== TRANSLATE_BACKEND.model };
};

/**
 * Модель, которой РАЗРЕШЕНО переводить. Всё остальное (в частности общие
 * Qwen/Strata) — только с явным `--allow-any-model`, иначе раннер падает.
 * Причина: 2026-11-15 прогон zh на 94 % ушёл на общей Qwen3.6-35B и никто не
 * заметил — «тихое» переключение модели недопустимо.
 */
export const TRANSLATION_MODEL = /index-translate/i;

export const isTranslationModel = (model: string): boolean => TRANSLATION_MODEL.test(model);
