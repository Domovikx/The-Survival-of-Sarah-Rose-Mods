import type { CastContract } from "../../cast.types.mts";

export const GenericMaleMature: CastContract = {
  name: "Generic Male Mature",
  gender: "M",
  age: "35-55",
  who: "Универсальный зрелый мужской типаж, спокойный, низковатый, нейтральный повествовательный тон; накрывает Gideon, Ramsey, Garret, Marius и др.",
  instruct_en:
    "Male, 35-55 years old, medium height with a solid average build, weathered face with deep lines, greying hair, upright posture, steady measured gait",
  instruct_ru:
    "Мужской, 35-55 лет, средний рост, плотное обычное телосложение, обветренное лицо с глубокими морщинами, седеющие волосы, прямая осанка, устойчивая размеренная походка",
  texts: [
    {
      text: "Тридцать лет я служил короне и не жалею ни об одном дне. Войны сменялись миром, чума сменялась урожаем, а я оставался на своём посту и делал то, что велел долг, не задавая лишних вопросов.",
      emotion_en: "Steadily, with quiet dutiful pride",
      emotion_ru: "Ровно, с тихой гордостью долга",
    },
    {
      text: "Совет соберётся на рассвете, и решение будет непростым, но необходимым. Я прошу тебя выслушать его до конца, прежде чем судить, потому что в мои годы я научился отличать трудное решение от ошибочного.",
      emotion_en: "Solemnly, with measured counsel",
      emotion_ru: "Серьёзно, с размеренным советом",
    },
    {
      text: "В моём возрасте начинаешь ценить тишину больше, чем разговоры, и пустые слова теряют всякую цену. Но с тобой я готов говорить хоть до утра, потому что таких слушателей, как ты, я встречал нечасто за свои годы.",
      emotion_en: "Warmly, with quiet appreciation",
      emotion_ru: "Тепло, с тихой признательностью",
    },
  ],
};
