/** Общие типы и базовые правила всех языковых профилей po:translate. */
export interface LangProfile {
  /** Код языка = имя файла po/<code>.po. */
  code: string;
  /** Человекочитаемое имя. */
  name: string;
  /** Готовый блок правил для system prompt (EN). */
  rules: string;
  /** Запрещённые слова/паттерны в сценах: regex + пояснение для отчёта. */
  forbidden: Array<[string, string]>;
  /**
   * Обязательные замены для ИСПОЛНИМОГО фидбэка: слово-нарушитель -> что
   * писать вместо. Без такого указания модель читала запрещённое слово в
   * RULE-подсказке, застревала на нём и отдавала байт-в-байт один вариант
   * (инцидент 2026-10-26: «entre vosotros» 8 попыток подряд). Явная связка
   * «replace X with Y» чинится с первой попытки — проверено вживую.
   */
  replacements?: Array<[string, string]>;
  /** Стиль-примеры few-shot (проверенные переводы): EN -> TARGET. */
  fewshot: Array<[string, string]>;
  /** Дополнительные пункты для судьи (пер-языковая специфика). */
  judgeNotes: string;
  // КРИТ-ФИКС 2026-10-24: lenMin/lenMax (проверка длины перевода) ВЫПИЛЕНЫ —
  // ratio-лимит ломал CJK (1 иероглиф = слово) и короткие UI-кнопки.
}

export const COMMON = `HARD RULES:
- Output STRICT JSON only: {"tr":"<translation>"}. The key is always "tr" (it is NOT a language hint — it just means "translation"). No commentary.
- Translate ONLY the final user line (the msgid). Preceding quoted lines are scene context — do NOT translate them.
- NEVER wrap the line in quotation marks: the game renders speech on screen and the English source has no quotes. Use quotes ONLY where the English itself quotes something inside the text (mirror it).
- Keep %s/{name}/{i}...{/i} placeholders and Ren'Py text tags verbatim.
- Names and titles are never translated ("King Orwell" -> localized title + Orwell, the name itself untouched).
- Keep "..." as "...", keep repetitions and exclamations. NO length requirement: translation may be shorter or longer than the English line — never trim or pad to match length.
- Idioms are localized, not translated word-by-word.
- The emotion tag gives the speaker's delivery (Whispering, afraid = whispered; In a burst of passion = a cry). Tone fidelity outranks literalness.
- The translation must lose no concreteness: adverbs, possessives, locations, qualifiers all stay.
- Natural target-language word order — never mirror English syntax mechanically.`;

export const EROTIC_NOTE = `Adult register: the game is explicit EROTIC PROSE, not medicine. Frank, never softened, never euphemized, nothing erotic dropped.`;
