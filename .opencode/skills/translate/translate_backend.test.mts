import assert from "node:assert/strict";
import { test } from "node:test";

import { isTranslationModel, resolveTranslateBackend, TRANSLATE_BACKEND } from "./translate_backend.mts";

/**
 * Перевод идёт СПЕЦИАЛЬНОЙ моделью (Index-Translate-9B), а не тем, что сейчас
 * выбрано в пульте бэкендов: 2026-11-15 из-за этого zh на 94 % перевела общая
 * Qwen3.6-35B из Strata. Эти тесты фиксируют правило.
 */

test("по умолчанию — Index-Translate-9B в LM Studio", () => {
  const backend = resolveTranslateBackend([], {});
  assert.equal(backend.model, TRANSLATE_BACKEND.model);
  assert.equal(backend.url, TRANSLATE_BACKEND.url);
  assert.equal(backend.overridden, false);
});

test("пульт бэкендов не подмешивается: чужие переменные не влияют", () => {
  // TSSR_LLM (имя бэкенда пульта) переводчик игнорирует — иначе смена чата
  // молча меняла бы модель перевода.
  const backend = resolveTranslateBackend([], { TSSR_LLM: "strata", TSSR_LLM_MODEL: undefined });
  assert.equal(backend.model, TRANSLATE_BACKEND.model);
});

test("env-переопределение работает и помечается", () => {
  const backend = resolveTranslateBackend([], { TSSR_LLM_MODEL: "qwen3.6-35b-a3b-ud-q4_k_xl" });
  assert.equal(backend.model, "qwen3.6-35b-a3b-ud-q4_k_xl");
  assert.equal(backend.overridden, true);
});

test("CLI сильнее env", () => {
  const backend = resolveTranslateBackend(["--model", "custom-model", "--base-url", "http://127.0.0.1:9999"], {
    TSSR_LLM_MODEL: "env-model",
    TSSR_LLM_URL: "http://127.0.0.1:8888",
  });
  assert.deepEqual({ url: backend.url, model: backend.model }, { url: "http://127.0.0.1:9999", model: "custom-model" });
  assert.equal(backend.overridden, true);
});

test("чужая модель в перевод не допускается (Strata/Qwen3.6 — STOP)", () => {
  assert.equal(isTranslationModel(TRANSLATE_BACKEND.model), true);
  assert.equal(isTranslationModel("index-translate-9b"), true);
  assert.equal(isTranslationModel("qwen3.6-35b-a3b-ud-q4_k_xl"), false);
  assert.equal(isTranslationModel("qwen/qwen3.5-9b"), false);
});
