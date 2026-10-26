import type { LangProfile } from "./common.mts";
import { COMMON, EROTIC_NOTE } from "./common.mts";

export const profile: LangProfile = {
  code: "es",
  name: "Español (España + LatAm)",
  rules: `${COMMON}
- Address form: "tú" everywhere between lovers/friends/family/servants; "usted" ONLY for subjects addressing monarchs/high lords/priests (Su Majestad, su señoría). NEVER "vos"/voseo, NEVER "vosotros" — plural "you" is always "ustedes".
- Vocabulary neutral for both Spain and LatAm (prefer "computadora"). FORBIDDEN: "coger" (obscene in LatAm), "concha" (LatAm insult), "usteded" (typo).
- Gender agreement is CRITICAL: adjectives/participles/nicknames agree with the subject. Sarah is FEMALE (avergonzada, cansada, una borracha, como una niña). Determine the subject from the speaker name and pronouns in the English line.
${EROTIC_NOTE}
  FORBIDDEN in scenes: "penetrar", "pene", "vagina" (except lines by doctors/scientists).
  Lexicon (one term per scene, vary synonyms ACROSS scenes): pussy -> "coño" (scene) / "entre sus piernas" (soft narration); cunt -> ALWAYS "coño" (anatomy, even as insult, never "puta"); cock/dick -> "polla" / "verga" (harsher) / "miembro" (elevated narration); balls -> "huevos" / "cojones"; tits -> "tetas" (crude) / "pechos" (neutral) / "senos" (elevated); ass -> "culo" (crude) / "trasero" (soft); whore -> "puta"; slut -> "zorra" (ES) / "puta"; fuck (v.) -> "follar"; fuck! (shout) -> "¡Joder!" / "¡Carajo!" (NOT "¡Mierda!"); cum -> "leche" / "semilla" / "semen" (never "líquido seminal"); wet -> "mojada" / "empapada".
  "between her legs" -> "entre sus piernas" (NEVER "entre sus muslos").`,
  forbidden: [
    // Границы слов — через (?<!\p{L})/ (?!\p{L}): JS \b считает по ASCII-\w
    // и НЕ ловит "penetró" (ó не word-char → нет границы перед пробелом).
    ["(?<!\\p{L})penetr(?:ar|ó|o|a|ando|ada|ado|ación)(?!\\p{L})", "клинический penetrar"],
    ["\\bpene\\b", "клинический pene"],
    ["\\bvagina\\b", "клинический vagina"],
    ["\\bconcha\\b", "латино-мин concha"],
    ["\\bcoger\\b", "латино-мин coger"],
    ["\\bvosotros\\b", "форма España (файл для обоих регионов)"],
    ["\\busteded\\b", "опечатка usteded"],
    ["\\btestículos\\b", "клинический testículos"],
    ["entre sus muslos", "muslos вместо piernas"],
    [
      "\\bun (mente|cabeza|persona|cosa|mujer|noche|vez|vida|mano|voz|pieza|muerte)\\b",
      "род: un + существительное женского рода",
    ],
    ["\\bunas? (senos|manos|piernas|nalgas|ojos|orejas)\\b", "число/род: несогласованная форма"],
  ],
  fewshot: [
    [
      "A complicated flurry of emotions rocked her body as she began to slowly finger herself.",
      "Un complicado torbellino de emociones sacudió su cuerpo mientras comenzaba a masturbarse lentamente con los dedos.",
    ],
    ["A cock hungry slut...pretending to be a deck hand.", "Una zorra hambrienta de polla... fingiendo ser marinera."],
    [
      "A blood-curdling scream rings out across the silenced mass of slaves.",
      "Un grito desgarrador resuena sobre la masa enmudecida de esclavos.",
    ],
    [
      "A cheap ship whore who will suck my dick the moment I order her to?",
      "¿Una puta barata de barco que me chupará la polla apenas le dé la orden?",
    ],
  ],
  judgeNotes: `Spanish-specific: gender agreement (Sarah = FEMALE), tú not usted/usteded, no vosotros, neutral ES+LatAm vocabulary, lexicon table respected (no clinical terms in scenes, "cunt"="coño" anatomy not insult, "fuck!" shout = "¡Joder!" not "¡Mierda!").`,
};
