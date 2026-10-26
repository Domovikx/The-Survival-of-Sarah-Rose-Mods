import type { LangProfile } from "./common.mts";
import { COMMON, EROTIC_NOTE } from "./common.mts";

export const profile: LangProfile = {
  code: "pt",
  name: "Português (BR + PT)",
  rules: `${COMMON}
- Address form: "você" as neutral informal (understood in both BR and PT); "o senhor/a senhora" ONLY for subjects addressing monarchs/high lords/priests (Vossa Majestade). NEVER "tu" forms with -es conjugation (BR-neutral file).
- Vocabulary neutral for BR and PT (prefer words understood in both; avoid strong regionalisms: "cara" OK, "mano" BR-only — avoid).
- Gender agreement: Sarah is FEMALE ("ela estava cansada mas feliz", "uma mulher bêbada").
${EROTIC_NOTE}
  FORBIDDEN in scenes: "vagina", "pênis", "penetrar" (except doctors).
  Lexicon: pussy -> "boceta" (BR scene) / "xoxota" (BR crude) / "entre suas pernas" (soft); cunt -> "boceta" (anatomy); cock/dick -> "pau" / "rola" / "pinto"; balls -> "bolas"/"testículos"(clinical — avoid); tits -> "peitos" (neutral) / "seios" (elevated) / "tetos"(crude); ass -> "bunda" / "cu"; whore -> "puta"; slut -> "vadia" / "puta"; fuck (v.) -> "foder" / "transar"; fuck! (shout) -> "Merda!" / "Caralho!"; cum -> "porra" / "leite"; wet -> "molhada" / "encharcada".`,
  forbidden: [
    ["\\bvagina\\b", "клинический vagina"],
    ["\\bpênis\\b", "клинический pênis"],
    ["\\bpenetr(ar|ou|ando)\\b", "клинический penetrar"],
    ["\\btestículos\\b", "клинический testículos"],
    ["\\bel(a)? (estava|ficou) (cansado|feliz)\\b", "род: ela → -a"],
    // УТЕЧКА ИСПАНСКОГО В pt (бага QA 2026-10-25: 13 строк es внутри pt —
    // класс не ловился ничем). Высокоточные маркеры, которых в pt нет:
    ["ción", "испанский: «ción» вместо португальского «ção»"],
    ["ñ", "испанский: ñ вместо nh"],
    ["\\busted(?:es)?\\b", "испанский: usted(es) вместо você(vocês)"],
    ["vosotros", "испанский: vosotros"],
    ["\\bmás\\b", "испанский: más вместо mais"],
    ["\\bno le\\b", "испанский: «no le» вместо «não lhe»"],
    ["\\bsastre\\b", "испанский: sastre вместо alfaiate"],
    ["\\bescudero\\b", "испанский: escudero вместo escudeiro"],
    ["\\bmensajero\\b", "испанский: mensajero вместo mensageiro"],
    ["\\bequipo\\b", "испанский: equipo вместo equipe"],
    ["\\bcompartir\\b", "испанский: compartir вместo compartilhar"],
    ["\\balcalde\\b", "испанский: alcalde вместо prefeito"],
  ],
  fewshot: [
    ["Accept Ephraim and Caleb's proposal.", "Aceitar a proposta de Ephraim e Caleb."],
    ["Advances dialogue and activates the interface.", "Avança o diálogo e ativa a interface."],
    ["Advances dialogue without selecting choices.", "Avança o diálogo sem selecionar opções."],
    ["Hand over some of Sarah's jewelry.", "Entregue parte das joias de Sarah."],
    ["I think that's enough for me for tonight.", "Acho que é o suficiente para mim por hoje."],
  ],
  judgeNotes: `Portuguese-specific: BR/PT-neutral vocabulary, você-based addressing (no tu-conjugation), gender agreement, explicit register per lexicon.`,
};
