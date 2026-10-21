/**
 * Общий тип контракта каста для casts/{Имя}/{Имя}.yaml.
 *
 * Зеркало python-контракта `tools/generate/scripts/voicekit/contract.py`
 * (pydantic CastContract): строгие свои поля, только они — никаких extra.
 *
 * Использование:  import type { CastContract } from "../cast.types.mts";
 * Проверка:       npx tsc --noEmit (корневой tsconfig).
 */

export interface CastContract {
  /** Имя каста = имя папки = имя рефа {Имя}.wav. */
  name: string;
  /** M / F, "?" — дефолт контракта. */
  gender: "M" | "F" | "?";
  /** Возраст или типаж: "17-19", "ageless", "?". */
  age: string;
  /** Кто это: роль, характер, отношения, стиль речи. */
  who: string;
  /** Физиогномика + социальная роль для генерации (EN). */
  instruct_en: string;
  /** Русский перевод instruct_en для ревью. */
  instruct_ru: string;
  /**
   * Реплики-рефы (150–250 символов, клип ≥10с): каждая фраза — запись
   * с пофразовой эмоцией диктора (читает voice_design.text_item).
   * Строки-старый-формат запрещены.
   */
  texts: CastText[];
}

/** Фраза: текст + обязательные эмоции диктора (EN — для генерации, RU — ревью). */
export type CastText = { text: string; emotion_en: string; emotion_ru: string };
