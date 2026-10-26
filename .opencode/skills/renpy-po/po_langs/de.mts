import type { LangProfile } from "./common.mts";
import { COMMON, EROTIC_NOTE } from "./common.mts";

export const profile: LangProfile = {
  code: "de",
  name: "Deutsch",
  rules: `${COMMON}
- Address form: "du" between lovers/friends/family/servants; "Ihr/Sie" (formal) ONLY for subjects addressing monarchs/high lords/priests; nobles may be addressed "Euer Gnaden/Ihre Majestät". NEVER mix du and Ihr within one relationship unless the story marks an intimacy shift.
- Gender agreement: adjectives and participles must match gender/number/case of their nouns. Sarah is FEMALE (verlegen instead of verlegen... check: "she was tired but happy" -> "sie war müde, aber glücklich"; past participle "ge-X-t" has no gender but attributive adjectives decline: "die erschöpfte Frau").
${EROTIC_NOTE}
  FORBIDDEN in scenes: "Vagina", "Penis", "vaginal" (except doctors).
  Lexicon: pussy -> "Muschi" (scene) / "zwischen ihren Beinen" (soft); cunt -> "Muschi" (anatomy, even as insult); cock/dick -> "Schwanz" / "Dick" (harsher) / "Glied" (elevated); balls -> "Eier" / "Hoden" (clinical — avoid in scenes); tits -> "Titten" (crude) / "Brüste" (neutral); ass -> "Arsch" / "Hintern" (soft); whore -> "Hure"; slut -> "Schlampe"; fuck (v.) -> "ficken"; fuck! (shout) -> "Scheiße!" / "Verdammt!"; cum -> "Sperma" / "Milch"; wet -> "nass" / "durchweicht".`,
  forbidden: [
    ["\\b[Vv]agina\\b", "клинический Vagina"],
    ["\\b[Pp]enis\\b", "клинический Penis"],
    ["\\bHoden\\b", "клинический Hoden в сцене"],
    ["\\bvaginal\\b", "клинический vaginal"],
    ["\\b(Er|Sie) war (verlegen|müde|glücklich|wütend)\\b", "возможный род: субъект Sarah → sie war"],
    // УТЕЧКА ЧУЖОГО ЯЗЫКА в латинский файл (бага QA 2026-10-25: испанский
    // в it/pl/pt, немецкий в pl — судья не ловил). Маркеры, которых нет в de:
    ["ción", "испанский: «ción» — по-немецки всегда «tion»"],
    ["[¡¿]", "испанский восклицательный/вопросительный знак"],
    ["\\busted(?:es)?\\b", "испанский: usted вместо Sie/du"],
  ],
  fewshot: [
    ["Accept Ephraim and Caleb's proposal.", "Annahme des Vorschlags von Ephraim und Caleb."],
    ["I want to know why you did it.", "Ich will wissen, warum du es getan hast."],
    [
      "I will join the Brothers of Providence and reclaim Rosanna.",
      "Ich werde mich den Brüdern der Vorsehung anschließen und Rosanna zurückerobern.",
    ],
    ["I'm a princess of noble birth.", "Ich bin eine Prinzessin von edlem Blut."],
    ["Rolls back to earlier dialogue.", "Zurück zum früheren Dialog."],
  ],
  judgeNotes: `German-specific: adjective ending agreement (declension), du/Ihr consistency, explicit register per lexicon, no clinical terms in scenes.`,
};
