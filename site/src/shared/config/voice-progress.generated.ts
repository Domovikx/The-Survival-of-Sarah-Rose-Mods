/**
 * СГЕНЕРИРОВАНО — руками не править.
 *
 * Источник: `scripts/voice_progress.mts` (счётчики — voice_status.mts,
 * скорость — mtime файлов корпуса, только имена по контракту). Перегенерация:
 * `node scripts/voice_progress.mts` и деплой сайта.
 */
export type VoiceProgressData = {
  /** Когда снят снимок (ISO 8601). */
  updatedAt: string;
  /** Полная озвучка английского: сколько строк записано и сколько всего. */
  en: {
    done: number;
    plan: number;
    arcsDone: number;
    arcsTotal: number;
    ratePerMin: number | null;
    etaMin: number | null;
  };
};

export const VOICE_PROGRESS: VoiceProgressData = {
  "updatedAt": "2026-11-24T04:29:41.093Z",
  "en": {
    "done": 9655,
    "plan": 68357,
    "arcsDone": 4,
    "arcsTotal": 19,
    "ratePerMin": 0.9,
    "etaMin": 62930
  }
};
