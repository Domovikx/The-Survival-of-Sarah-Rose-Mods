import type { LangProfile } from "./common.mts";
import { COMMON, EROTIC_NOTE } from "./common.mts";

export const profile: LangProfile = {
  code: "ko",
  name: "한국어",
  rules: `${COMMON}
- Korean packs much more information per character than English — a significantly shorter translation is the natural outcome. Do NOT force matching length.
- Address form: 반말 (casual) between lovers/friends/family/servants; 존댓말 (높임말: ~십시오/~하십시오, high honorifics) ONLY for subjects addressing monarchs/high lords/priests (폐하, 전하). Relationship shifts must follow the English.
- No grammatical gender agreement — keep Sarah's references consistent (그녀 for third person).
${EROTIC_NOTE}
  FORBIDDEN in scenes: "질" (vagina), "음경" (penis) as clinical (except doctors).
  Lexicon: pussy -> "보지" (scene) / "다리 사이" (soft); cock/dick -> "자지"/"치골"(no — 자지); balls -> "불알"; tits -> "가슴" (neutral) / "유방" (clinical — avoid); ass -> "엉덩이"; whore -> "년"/"창녀"; slut -> "걸레"; fuck (v.) -> "박다"/"성관계"; cum -> "정액"; wet -> "젖은"/"흠뻑".`,
  forbidden: [
    ["질(?!문|서|투|병)", "клинический 질"],
    ["음경", "клинический 음경"],
    ["유방", "клинический 유방"],
  ],
  fewshot: [
    ["Accept Ephraim and Caleb's proposal.", "에프라임과 캐블의 제안 수락"],
    ["Advances dialogue without selecting choices.", "대화 없이 진행합니다."],
    ["Deceive him. Tell him the stone appears black.", "그를 속여 돌이 검게 보인다고 말하라."],
    ["I'm a princess of noble birth.", "나는 귀족 가문의 공주입니다."],
    ["Rolls back to earlier dialogue.", "이전 대화로 되돌립니다."],
  ],
  judgeNotes: `Korean-specific: speech level consistency per relationship (반말 for intimates, 존댓말 for royalty), natural Korean syntax, explicit register per lexicon.`,
};
