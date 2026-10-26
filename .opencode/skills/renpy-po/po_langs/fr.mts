import type { LangProfile } from "./common.mts";
import { COMMON, EROTIC_NOTE } from "./common.mts";

export const profile: LangProfile = {
  code: "fr",
  name: "Français",
  rules: `${COMMON}
- Address form: "tu" between lovers/friends/family/servants; "votre/vous" ONLY for subjects addressing monarchs/high lords/priests (Votre Majesté). NEVER mix within one relationship.
- Gender agreement: past participles used as adjectives agree in gender/number. Sarah is FEMALE ("elle était fatiguée mais heureuse", "une femme ivre").
${EROTIC_NOTE}
  FORBIDDEN in scenes: "vagin", "pénis", "pénétrer" (except doctors).
  Lexicon: pussy -> "chatte" (scene) / "entre ses jambes" (soft); cunt -> "chatte" (anatomy, even as insult); cock/dick -> "bite" / "queue" (cruder) / "membre" (elevated); balls -> "boules" / "couilles" (crude); tits -> "seins" (neutral) / "tétons" / "grosse poitrine"; ass -> "cul" / "fesses" (soft); whore -> "salope"; slut -> "salope" / "pétasse"; fuck (v.) -> "enculer" / "baiser"; fuck! (shout) -> "Merde!" / "Putain!"; cum -> "sperme" / "lait"; wet -> "mouillée" / "trempée".`,
  forbidden: [
    ["\\bvagin\\b", "клинический vagin"],
    ["\\bpénis\\b", "клинический pénis"],
    ["(?<!\\p{L})pénetr(?:er|e|ant)(?!\\p{L})", "клинический pénétrer"],
    ["(?<!\\p{L})elle était (?:fatigué|heureux|ivres?)(?!\\p{L})", "род: elle → женский (-e)"],
    // УТЕЧКА ЧУЖОГО ЯЗЫКА (бага QA 2026-10-25): маркеры, которых нет во французском
    ["ción", "испанский: «ción» (в fr = -tion)"],
    ["[¡¿]", "испанский знаки ¡ ¿"],
    ["\\busted(?:es)?\\b", "испанский: usted(es)"],
    ["vosotros", "испанский: vosotros"],
  ],
  fewshot: [
    ["Accept Ephraim and Caleb's proposal.", "Accepter la proposition d'Ephraim et Caleb."],
    ["Hand over some of Sarah's jewelry.", "Donne une partie des bijoux de Sarah."],
    ["I think that's enough for me for tonight.", "Je pense que c'est assez pour moi ce soir."],
    ["I'll take your proposal into consideration.", "Je prendrai votre proposition en considération."],
    ["Let's keep drinking. I have some wine in my room.", "Continuons à boire. J'ai du vin dans ma chambre."],
  ],
  judgeNotes: `French-specific: past-participle and adjective gender agreement (elle = féminin), tu/vous consistency, explicit register per lexicon.`,
};
