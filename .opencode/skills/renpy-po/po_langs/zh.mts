import type { LangProfile } from "./common.mts";
import { COMMON, EROTIC_NOTE } from "./common.mts";

export const profile: LangProfile = {
  code: "zh",
  name: "中文",
  rules: `${COMMON}
- Chinese is much denser than English — a significantly shorter translation is the natural outcome. Do NOT force matching length.
- Address form: plain/neutral for narration and equals; honorific/deferential phrasing (陛下, 阁下, 您) ONLY for subjects addressing monarchs/high lords/priests. Lovers/friends casual.
- No grammatical gender agreement — but keep pronoun consistency: 她 for Sarah, 他 for male third persons.
${EROTIC_NOTE}
  FORBIDDEN in scenes: "阴道" (vagina), "阴茎" (penis), "插入" as clinical (except doctors).
  Lexicon: pussy -> "逼"/"穴" (scene) / "双腿之间" (soft); cock/dick -> "鸡巴"/"屌"; balls -> "卵蛋"/"蛋"; tits -> "奶子"(crude) / "乳房"(neutral/clinical — prefer 奶子 in scenes); ass -> "屁股"/"臀"; whore -> "婊子"; slut -> "贱货"; fuck (v.) -> "操"/"干"; cum -> "精液"/"淫水"; wet -> "湿透"/"流水".`,
  forbidden: [
    ["阴道", "клинический 阴道"],
    ["阴茎", "клинический 阴茎"],
    ["\\b插入\\b", "клиническое 插入"],
  ],
  fewshot: [
    ["Accept Ephraim and Caleb's proposal.", "接受以法莲和卡莱布的提议"],
    ["Accept the bowl of food and sit on the old soldier's lap.", "接过那碗食物，坐在老兵的腿上。"],
    ["Deceive him. Tell him the stone appears black.", "欺骗他，告诉他石头是黑色的。"],
    ["Sarah can't do it, she drops the dagger.", "莎拉做不到，她丢下了匕首。"],
    ["Sarah has her pride, refuse to perform.", "莎拉有她的骄傲，拒绝表演。"],
  ],
  judgeNotes: `Chinese-specific: pronoun consistency (她 = Sarah), natural Chinese syntax (no translationese), explicit register per lexicon.`,
};
