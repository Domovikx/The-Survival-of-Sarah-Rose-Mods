import type { LangProfile } from "./common.mts";
import { COMMON, EROTIC_NOTE } from "./common.mts";

export const profile: LangProfile = {
  code: "pl",
  name: "Polski",
  rules: `${COMMON}
- Address form: "ty" between lovers/friends/family/servants; "Pan/Pani" ONLY for subjects addressing monarchs/high lords/priests (Wasza Królewska Mość).
- Cases: nouns/adjectives must decline correctly for their grammatical case — check every adjective-noun pair. Sarah is FEMALE ("była zmęczona, ale szczęśliwa", "pijana kobieta").
${EROTIC_NOTE}
  FORBIDDEN in scenes: "pochwa", "penis", "penetrować" (except doctors).
  Lexicon: pussy -> "cipka" (scene) / "między jej nogami" (soft); cunt -> "cipka" (anatomy, even as insult); cock/dick -> "kutas" / "pała" (harsher); balls -> "jaja" / "jądra" (clinical — avoid); tits -> "cycki" (crude) / "piersi" (neutral); ass -> "dupa" / "pośladki" (soft); whore -> "suka"; slut -> "suka" / "dziwka"; fuck (v.) -> "ruchać" / "jebać"; fuck! (shout) -> "Kurwa!" ; cum -> "sperma"; wet -> "mokra" / "przemoczona".`,
  forbidden: [
    ["\\bpochwa\\b", "клинический pochwa"],
    ["\\bpenis\\b", "клинический penis"],
    ["(?<!\\p{L})penetr(?:owac|ować|acja)(?!\\p{L})", "клинический penetrować"],
    [
      "(?<!\\p{L})(?:był(?:a)? (?:zmęczon|szczęśliw)|penetr(?:ować|ował(?:a|i|o)?|uje|ują|acja|acji))",
      "клинический penetrować / pl-род",
    ],
    // УТЕЧКА ЧУЖОГО ЯЗЫКА В pl (бага QA 2026-10-25: испанский в 14 строках,
    // целая немецкая [39298], английские заглушки): маркеры, которых в польском нет.
    ["ción", "испанский: «ción» (pl = -cja)"],
    ["ñ", "испанский: ñ"],
    ["[¡¿]", "испанский знаки ¡ ¿"],
    ["[äöüß]", "немецкий: äöüß"],
    ["\\b(?:ich|nicht|auch|sehr|wir)\\b", "немецкий: служебное слово вместо польского"],
    ["zione", "итальянский: «-zione» вместо польского «-cja»"],
    ["\\b(?:hazte|usted|vosotros|más)\\b", "испанский: маркер вместо польского"],
  ],
  fewshot: [
    ["Accept Ephraim and Caleb's proposal.", "Akceptuj propozycję Efraima i Kaleba."],
    ["Advances dialogue and activates the interface.", "Przyspiesza dialog i aktywuje interfejs."],
    ["I think that's enough for me for tonight.", "Myślę, że to wystarczająco dla mnie na dziś."],
    ["I'm a princess of noble birth.", "Jestem księżniczką z urodzenia."],
    ["Motion for Jaeid to go into the water.", "Ruch: wejście do wody"],
  ],
  judgeNotes: `Polish-specific: case agreement on every adjective-noun pair, ty/Pani consistency, explicit register per lexicon.`,
};
