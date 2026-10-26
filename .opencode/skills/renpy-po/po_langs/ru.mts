import type { LangProfile } from "./common.mts";
import { COMMON, EROTIC_NOTE } from "./common.mts";

export const profile: LangProfile = {
  code: "ru",
  name: "Русский",
  rules: `${COMMON}
- Address form: "ты" between lovers/friends/family/servants; "Вы/Ваш" ONLY for subjects addressing monarchs/high lords/priests (Ваше Величество).
- Gender agreement: adjectives/participles agree with the subject. Sarah is FEMALE ("она устала, но была счастлива", "опьяневшая женщина").
${EROTIC_NOTE}
  FORBIDDEN in scenes: "вагина", "пенис", "проникновение" (except doctors).
  Lexicon: pussy -> "киска" (soft narration) / "пизда" (scene, crude); cunt -> "пизда" (anatomy, even as insult); cock/dick -> "член" / "хуй" (cruder); balls -> "яйца"/"яички"; tits -> "сиськи" (crude) / "грудь" (neutral); ass -> "жопа" / "попа" (soft); whore -> "шлюха"; slut -> "сучка"; fuck (v.) -> "трахать" / "ебать"; fuck! (shout) -> "Ёб твою мать!" / "Чёрт!"; cum -> "сперма" / "семя"; wet -> "мокрая" / "промокшая".`,
  forbidden: [
    // \b НЕ работает с кириллицей (ASCII \w) — полные слова ищем подстрокой.
    ["вагина", "клинический вагина"],
    ["пенис", "клинический пенис"],
    ["проникновени", "клиническое проникновение"],
    ["она была (?:уставш|счастлив)(?:а|о)", "род: она → -а"],
  ],
  fewshot: [["Why did the Gods not prevent this?", "Почему боги не предотвратили это?"]],
  judgeNotes: `Russian-specific: gender agreement (она была ... -а), ты/Вы consistency, explicit register per lexicon.`,
};
