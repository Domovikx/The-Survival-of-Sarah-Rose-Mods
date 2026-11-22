/**
 * СГЕНЕРИРОВАНО — руками не править.
 *
 * Источник: `scripts/stats.mts` (языки — config/language-priority.json,
 * перевод — po/<lang>.po, озвучка — audio/ + план POT, тег — site/.../pack.ts).
 * Перегенерация: `npm run stats:update`. Проверка: `npm run stats:check`.
 */
import type { Stats } from "./stats.types.ts";

export const STATS = {
    "updatedAt": "2026-11-22T13:05:09.134Z",
    "packTag": "v2026.11.19-2237",
    "langs": [
      "en",
      "zh",
      "ru",
      "es",
      "pt",
      "de",
      "ja",
      "fr",
      "pl",
      "ko",
      "it"
    ],
    "perLang": {
      "en": {
        "po": {
          "filled": 0,
          "total": 0
        },
        "voice": {
          "done": 9274,
          "plan": 68357
        }
      },
      "zh": {
        "po": {
          "filled": 69120,
          "total": 69120
        },
        "voice": {
          "done": 1284,
          "plan": 68357
        }
      },
      "ru": {
        "po": {
          "filled": 69120,
          "total": 69120
        },
        "voice": {
          "done": 1397,
          "plan": 68357
        }
      },
      "es": {
        "po": {
          "filled": 69120,
          "total": 69120
        },
        "voice": {
          "done": 1284,
          "plan": 68357
        }
      },
      "pt": {
        "po": {
          "filled": 69120,
          "total": 69120
        },
        "voice": {
          "done": 1284,
          "plan": 68357
        }
      },
      "de": {
        "po": {
          "filled": 69120,
          "total": 69120
        },
        "voice": {
          "done": 1284,
          "plan": 68357
        }
      },
      "ja": {
        "po": {
          "filled": 69120,
          "total": 69120
        },
        "voice": {
          "done": 1173,
          "plan": 68357
        }
      },
      "fr": {
        "po": {
          "filled": 69120,
          "total": 69120
        },
        "voice": {
          "done": 1171,
          "plan": 68357
        }
      },
      "pl": {
        "po": {
          "filled": 69120,
          "total": 69120
        },
        "voice": {
          "done": 1171,
          "plan": 68357
        }
      },
      "ko": {
        "po": {
          "filled": 69120,
          "total": 69120
        },
        "voice": {
          "done": 1171,
          "plan": 68357
        }
      },
      "it": {
        "po": {
          "filled": 69120,
          "total": 69120
        },
        "voice": {
          "done": 1171,
          "plan": 68357
        }
      }
    }
  } as const satisfies Stats;

export type { LangStats, Stats } from "./stats.types.ts";
