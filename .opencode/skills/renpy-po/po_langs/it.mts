import type { LangProfile } from "./common.mts";
import { COMMON, EROTIC_NOTE } from "./common.mts";

export const profile: LangProfile = {
  code: "it",
  name: "Italiano",
  rules: `${COMMON}
- Address form: "tu" between lovers/friends/family/servants; "Lei" ONLY for subjects addressing monarchs/high lords/priests (Vostra Maestà).
- Gender agreement: adjectives/participles agree with the subject. Sarah is FEMALE ("era stanca ma felice", "una donna ubriaca").
${EROTIC_NOTE}
  FORBIDDEN in scenes: "vagina", "pene", "penetrare" (except doctors).
  Lexicon: pussy -> "figa" (scene) / "tra le sue gambe" (soft); cunt -> "figa" (anatomy, even as insult); cock/dick -> "cazzo" / "pollone" (harsher) / "membro" (elevated); balls -> "palle" / "coccole"(no — testicoli clinical); tits -> "tette" (crude) / "seni" (neutral/elevated); ass -> "culo" / "sedere" (soft); whore -> "puttana"; slut -> "puttana" / "zoccola"; fuck (v.) -> "fottere"; fuck! (shout) -> "Cavolo!" / "Porca miseria!"; cum -> "sperma" / "latte"; wet -> "bagnata" / "fradicia".`,
  forbidden: [
    ["\\bvagina\\b", "клинический vagina"],
    ["\\bpene\\b", "клинический pene"],
    ["(?<!\\p{L})penetr(?:are|ò|ó|ato|ando|azione)(?!\\p{L})", "клинический penetrare"],
    ["\\btesticoli\\b", "клинический testicoli"],
    ["\\bera (stanco|felice|ubriaco)\\b", "род: Sarah → -a"],
    // УТЕЧКА ЧУЖОГО ЯЗЫКА В it (бага QA 2026-10-25: 101 строка испанского в
    // it.po — «Finalmente, a casa otra vez», «¡Voy!»; судья ставил 9-10).
    // Маркеры, которых в итальянском НЕТ:
    ["ción", "испанский: «ción» вместо итал. «-zione»"],
    ["ñ", "испанский: ñ (по-итальянски не бывает)"],
    ["[¡¿]", "испанский знаки ¡ ¿ (итал. только ! ?)"],
    ["[áíóú]", "испанский: острый ударный (итал. только è/é/à/ò/ù/ì)"],
    ["\\bmás\\b", "испанский: más вместо di più"],
    ["\\busted(?:es)?\\b", "испанский: usted(es) вместо Lei/voi"],
    ["vosotros", "испанский: vosotros"],
    ["\\bno le\\b", "испанский: «no le» вместо «non gli/le»"],
    ["\\botr[oa]s?\\b", "испанский: otro/otra (итал. altro/a)"],
    ["\\b(?:hazte|estaba|estoy|también|después)\\b", "испанский: маркер вместо итальянского"],
  ],
  fewshot: [
    ["Accept Ephraim and Caleb's proposal.", "Accetta la proposta di Efraim e Caleb."],
    ["Advances dialogue and activates the interface.", "Avanza il dialogo e attiva l'interfaccia."],
    ["I want to know why you did it.", "Voglio sapere perché l'hai fatto."],
    ["Ignore, turn around and leave.", "Ignora, gira e vai."],
    ["Rolls back to earlier dialogue.", "Riavvolge al dialogo precedente."],
  ],
  judgeNotes: `Italian-specific: gender agreement (era stanca, una donna...), tu/Lei consistency, explicit register per lexicon.`,
};
