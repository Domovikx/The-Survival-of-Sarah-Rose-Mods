/**
 * Гард БД пола (casts/gender.mts): литеральная карта обязана покрывать всех
 * спикеров POT и совпадать с контрактами (DRY через тест — правишь контракт,
 * падает тест, зеркалишь в карту). Плюс синхронный genderOf() для быстрых
 * вопросов «к кому обращаюсь и какой пол».
 * Запуск: node --test patches/ai-voice-pack/casts/gender.test.mts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { loadAll } from "../tools/generate/scripts/cast_contract.mts";
import { SPEAKERS } from "./casts.mts";
import { SPEAKER_GENDER, genderOf } from "./gender.mts";

test("БД пола покрывает всех спикеров POT и совпадает с контрактами", async () => {
  const contracts = await loadAll();
  const missing: string[] = [];
  const mismatch: string[] = [];
  let n = 0;
  for (const [spk, voice] of Object.entries(SPEAKERS)) {
    if (!voice) continue; // null = без голоса (не бывает, но тип позволяет)
    n++;
    if (!(spk in SPEAKER_GENDER)) {
      missing.push(spk);
      continue;
    }
    const c = contracts[voice];
    if (c && SPEAKER_GENDER[spk] !== c.gender) {
      mismatch.push(`${spk}: карта=${SPEAKER_GENDER[spk]} vs контракт(${voice})=${c.gender}`);
    }
  }
  assert.ok(n >= 140, `спикеров с голосом: ${n} (ожидалось ~148)`);
  assert.deepEqual(missing, [], `нет в БД (добавь в casts/gender.mts): ${missing.join(", ")}`);
  assert.deepEqual(mismatch, [], `рассинхрон с контрактами:\n${mismatch.join("\n")}`);
});

test("genderOf: быстрый синхронный ответ (бага рода 2026-11-02)", () => {
  assert.equal(genderOf("Xanthippe"), "M", "Xanthippe — мужчина (script.rpy: he/his/the man)");
  assert.equal(genderOf("Sarah"), "F");
  assert.ok(genderOf("NoSuchCharacter") === null, "нет в БД → null");
  // литерал читается без async — это и есть смысл БД
  assert.equal(typeof SPEAKER_GENDER["Sarah"], "string");
});
