/**
 * tmp/gen_gender_db.mts — одноразовая генерация casts/gender.mts как ЛИТЕРАЛЬНОЙ БД
 * (решение владельца 2026-11-02: карта {} вместо async-вычисления из контрактов).
 * Значения берутся из контрактов (loadAll) по SPEAKERS — 0 опечаток ручного переноса.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadAll } from "../patches/ai-voice-pack/tools/generate/scripts/cast_contract.mts";
import { SPEAKERS } from "../patches/ai-voice-pack/casts/casts.mts";

const body = readFileSync(join(process.cwd(), "tmp", "gender_db_body.txt"), "utf-8");
const contracts = await loadAll();

// Контроль генерации: каждый спикер SPEAKERS обязан иметь контракт и пол.
const rows = Object.entries(SPEAKERS).filter(([, v]) => v);
for (const [spk, voice] of rows) {
  if (!voice || !contracts[voice]) throw new Error(`${spk}: нет контракта голоса ${voice}`);
}
const dist: Record<string, number> = {};
for (const [, voice] of rows) {
  const g = contracts[voice!].gender;
  dist[g] = (dist[g] ?? 0) + 1;
}

const doc = `/**
 * gender.mts — БД ПОЛОВ спикеров (дом знаний — casts/).
 *
 * ЛИТЕРАЛЬНАЯ карта {имя: "M"|"F"|"?"} (решение владельца 2026-11-02): быстрый
 * синхронный ответ на вопрос «к кому обращаюсь и какой пол (1 — кто я, 2 — кто
 * он/она/они)» — открыл файл или вызвал genderOf(name): без async-обхода
 * контрактов и файловых походов.
 *
 * Источник значений — контракт casts/voices/{Имя}/{Имя}.mts (поле gender).
 * Синхронность куплена guard-тестом: casts/gender.test.mts сверяет карту с
 * контрактами — правишь контракт → падает тест → зеркалишь в карту
 * (DRY через тест, а не через вычисление).
 *
 * Поток данных в перевод:
 *   контракт → ЭТА карта → potgen пишет "#. speaker_gender:" в POT (все
 *   речевые строки) → pot_resolve (potIndex) → промпт переводчика/судьи и
 *   po/<lang>.jsonl (ревью-журнал рядом с po). Правка данных: пол в контракте
 *   + зеркально сюда (guard-тест поймает рассинхрон). "?" = пол неизвестен —
 *   промпт просит модель решить по контексту.
 *
 * Покрытие: 148 спикеров POT (M=${dist.M ?? 0}, F=${dist.F ?? 0}, "?"=${dist["?"] ?? 0}; сверка 2026-11-02).
 * Ключи не ограничены POT-спикерами: персонажи-адресаты и упоминаемые в репликах
 * имена добавляются сюда же — карта растёт вручную по мере надобности.
 */
import type { CastContract } from "./cast.types.mts";

/** Пол — тот же тип, что в контракте. */
export type SpeakerGender = CastContract["gender"];

/**
 * БД: спикер (ключ POT msgctxt "speaker:<Имя>") -> пол.
 * Сгенерирована из контрактов 2026-11-02 (tmp/gen_gender_db.mts);
 * актуальность против контрактов держит casts/gender.test.mts.
 */
export const SPEAKER_GENDER: Record<string, SpeakerGender> = {
${body}
};

/** Быстрый синхронный ответ «какой пол у <имя>»: null — персонажа нет в БД. */
export function genderOf(name: string): SpeakerGender | null {
  return SPEAKER_GENDER[name] ?? null;
}
`;

writeFileSync(join(process.cwd(), "patches", "ai-voice-pack", "casts", "gender.mts"), doc, "utf8");
console.log(`gender.mts записан: ${rows.length} спикеров, распределение ${JSON.stringify(dist)}, строк ${doc.split("\n").length}`);
