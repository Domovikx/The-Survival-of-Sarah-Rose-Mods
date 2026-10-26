/**
 * po_langs/index.mts — сборка языковых профилей.
 * Атомизация 2026-10-26: каждый язык в своём файле (своя специфика:
 * морфология, формы обращения, few-shot) без правок соседних языков.
 */
import type { LangProfile } from "./common.mts";
import { COMMON } from "./common.mts";
import { profile as es } from "./es.mts";
import { profile as de } from "./de.mts";
import { profile as fr } from "./fr.mts";
import { profile as it } from "./it.mts";
import { profile as pl } from "./pl.mts";
import { profile as pt } from "./pt.mts";
import { profile as ru } from "./ru.mts";
import { profile as ja } from "./ja.mts";
import { profile as ko } from "./ko.mts";
import { profile as zh } from "./zh.mts";

export type { LangProfile } from "./common.mts";

export const LANGS: Record<string, LangProfile> = {
  es,
  de,
  fr,
  it,
  pl,
  pt,
  ru,
  ja,
  ko,
  zh,
};

export function langProfile(code: string): LangProfile {
  const p = LANGS[code];
  if (p) return p;
  throw new Error(
    `Неизвестный язык "${code}". Доступные: ${Object.keys(LANGS).join(", ")}. Профиль: po_langs/<code>.mts`,
  );
}

/**
 * ЯЗЫКОВАЯ часть rules — БЕЗ общего блока COMMON.
 *
 * Нужна судье: JUDGE_SYSTEM требует «the target-language lexicon in the task
 * rules is MANDATORY», но судье раньше передавали лишь одно предложение
 * judgeNotes — она судила по таблице, которой не было в контексте, и
 * противоречила сама себе («semen → cum» в одном месте, «esperma → semen»
 * в другом). Инцидент 2026-10-26.
 *
 * COMMON вырезаем осознанно: он велит выводить `{"tr": ...}`, а судья обязана
 * отдавать `{"score": ...}` — отдавать ей оба правила нельзя.
 */
export function languageRules(code: string): string {
  const rules = langProfile(code).rules;
  return rules.startsWith(COMMON) ? rules.slice(COMMON.length).trim() : rules;
}
