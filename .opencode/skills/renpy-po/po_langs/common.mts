/**
 * po_langs/common.mts — типы языковых профилей + загрузка ОБЩИХ правил.
 *
 * ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВИЛ (DRY, 2026-11-03): общий текст правил и
 * регистр живут в одном документе — `.opencode/skills/translation-quality/SKILL.md`
 * (русский, для ревью владельцем). Код читает отмеченные блоки оттуда:
 * владелец правит документ → это же работает в промпте. Дублировать текст
 * здесь нельзя — это и был прежний разнобой правил.
 *
 * RU-текст в промпте допустим: целевой язык задаётся отдельным блоком
 * OUTPUT LANGUAGE + нейтральным ключом "tr" (см. systemPrompt).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "translation-quality", "SKILL.md");

/** Читает отмеченный блок из единого документа правил. */
function blockOf(mark: string): string {
  const md = readFileSync(SKILL_PATH, "utf-8");
  const open = `<!-- ${mark} -->`;
  const close = `<!-- /${mark} -->`;
  const i = md.indexOf(open);
  const j = md.indexOf(close);
  if (i < 0 || j <= i) {
    throw new Error(
      `translation-quality/SKILL.md: не найден блок "${mark}" (нужны <!-- ${mark} --> ... <!-- /${mark} -->)`,
    );
  }
  return md.slice(i + open.length, j).trim();
}

/** Общие правила всех языков — из единого документа. */
export const COMMON = blockOf("ПРАВИЛА");
/** Регистр игры (эротическая проза) — из единого документа. */
export const EROTIC_NOTE = blockOf("РЕГИСТР");

export interface LangProfile {
  /** Код языка = имя файла po/<code>.po. */
  code: string;
  /** Человекочитаемое имя. */
  name: string;
  /** Готовый блок правил для system prompt: COMMON (из документа) + языковая специфика. */
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
  // КРИТ-ФИКС 2026-10-24: lenMin/lenMax (проверка длины перевода) ВЫПИЛЕНЫ —
  // ratio-лимит ломал CJK (1 иероглиф = слово) и короткие UI-кнопки.
}
