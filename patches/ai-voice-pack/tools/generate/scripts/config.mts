/**
 * config.mts — типизированный доступ к voice_presets.mts (единой карте
 * конфигов озвучки; раньше был yaml в корне репы, переписан на TS
 * и перенесён к скриптам 2026-10-21).
 *
 * Использование:
 *   section("batch")                        // секция (объект или {})
 *   get("design", "temperature", 0.9)       // значение с дефолтом
 *   REFS / AUDIO / ...                      // типизированные секции напрямую
 *
 * Фолбэк-дефолты у потребителей остаются: модуль — единственный источник,
 * но при ошибке запуска node/импорта скрипт не должен падать молча.
 */
import { AUDIO, BATCH, BEASTIFY, DESIGN, REFS, VOICE_PRESETS } from "./voice_presets.mts";

export { AUDIO, BATCH, BEASTIFY, DESIGN, REFS };
export type { VoicePresets } from "./voice_presets.mts";

/** Весь конфиг (секции audio/refs/design/batch/beastify). */
export function load(): Record<string, unknown> {
  return VOICE_PRESETS as unknown as Record<string, unknown>;
}

/** Секция конфига (например "refs") -> объект (или {}). */
export function section(name: string): Record<string, unknown> {
  const d = (VOICE_PRESETS as unknown as Record<string, unknown>)[name];
  return d !== null && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, unknown>) : {};
}

/** Значение ключа секции с дефолтом. */
export function get<T>(group: string, key: string, fallback: T): T {
  const v = section(group)[key];
  return v === undefined ? fallback : (v as T);
}
