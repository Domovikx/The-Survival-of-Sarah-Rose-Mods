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
  "updatedAt": "2026-11-22T07:17:08.621Z",
  "en": {
    "done": 9274,
    "plan": 68357,
    "arcsDone": 3,
    "arcsTotal": 19,
    "ratePerMin": null,
    "etaMin": null
  }
};
