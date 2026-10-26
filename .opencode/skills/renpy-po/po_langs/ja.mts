import type { LangProfile } from "./common.mts";
import { COMMON, EROTIC_NOTE } from "./common.mts";

export const profile: LangProfile = {
  code: "ja",
  name: "日本語",
  rules: `${COMMON}
- Japanese packs much more information per character than English — a significantly shorter translation is the natural outcome. Do NOT force matching length; do not pad unnaturally either.
- Address form: default neutral/plain form for narration and equals; polite (敬語: です/ます, ～られる) ONLY where the relationship demands it (subjects to monarchs/lords: 陛下/閣下 + polite form). Lovers/friends use casual form. Honorific suffix -様 for names of high rank when the English shows deference.
- No grammatical gender agreement — but keep Sarah's references feminine-consistent (彼女, and feminine first-person 私/あたし if a female speaker uses one in English context).
${EROTIC_NOTE}
  FORBIDDEN in scenes: "膣" (vagina), "陰茎" (penis), "侵入" as clinical (except doctors).
  Lexicon: pussy -> "マンコ"/"おまんこ" (scene) / "脚の間" (soft); cock/dick -> "チンポ"/"デキチン" / "陰茎"(elevated — avoid in scenes); balls -> "タマ"; tits -> "おっぱい" (crude) / "胸" (neutral); ass -> "お尻"; whore -> "売春婦"/"クズ"; slut -> "スケベ女"; fuck (v.) -> "セックスする"/"犯す"; cum -> "精子"/"乳"; wet -> "濡れた".`,
  forbidden: [
    ["膣", "клинический 膣"],
    ["\\b陰茎\\b", "клинический 陰茎"],
    ["侵入(?!者)", "клиническое 插入/侵入"],
  ],
  fewshot: [
    ["Accept the bowl of food and sit on the old soldier's lap.", "食器を受け取り、老兵の膝に座る。"],
    ["Sarah plunges the dagger into her heart.", "サラはナイフを心臓に突き刺した。"],
    [
      "Sarah's heart is lost to Atilla, she cannot turn away from him.",
      "サラの心はアティラに奪われ、彼から目を逸らすことはできない。",
    ],
    ["Skips dialogue while held down.", "押し続けたままにすると、対話をスキップします。"],
    ["Turn around to see the source of the sound.", "音の元を確認するために振り返れ"],
  ],
  judgeNotes: `Japanese-specific: keigo consistency per relationship (casual for intimates, polite for monarchs), natural Japanese syntax (no translationese), explicit register per lexicon.`,
};
