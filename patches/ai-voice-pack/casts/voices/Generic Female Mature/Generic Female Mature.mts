import type { CastContract } from "../../cast.types.mts";

export const GenericFemaleMature: CastContract = {
  name: "Generic Female Mature",
  gender: "F",
  age: "35-60",
  who: "Универсальный зрелый женский типаж, спокойный, глубокий, ровный; накрывает Miriam, Hecate, Maeiv.",
  instruct_en:
    "Female, 35-60 years old, medium height with a full-figured matronly build, soft rounded face with fine lines, greying hair, calm upright posture, unhurried steady gait",
  instruct_ru:
    "Женский, 35-60 лет, средний рост, полноватая статная фигура, мягкое округлое лицо с тонкими морщинками, седеющие волосы, спокойная прямая осанка, неторопливая ровная походка",
  texts: [
    {
      text: "Двадцать лет я веду этот дом, и он пережил худшие времена: голод, пожары и войны. Переживёт и нынешние, если каждый будет делать своё дело и не совать нос в чужие заботы, как у нас принято испокон веков.",
      emotion_en: "With steady household authority and calm command",
      emotion_ru: "С ровным хозяйственным авторитетом и спокойным повелением",
    },
    {
      text: "Не перебивай старших, деточка, это первое правило приличного воспитания. Дослушай до конца, не торопись с ответом, и, может быть, ты услышишь нечто такое, что однажды спасёт тебе жизнь.",
      emotion_en: "Mildly stern, with maternal gravity",
      emotion_ru: "Мягко-строго, с материнской серьёзностью",
    },
    {
      text: "Всё повторяется, милая: войны, болезни, свадьбы и похороны. Только лица меняются, а человеческие глупости и страсти остаются прежними, и тот, кто прожил долгую жизнь, узнаёт в новом дне старую песню.",
      emotion_en: "With world-weary wisdom and tender melancholy",
      emotion_ru: "С обветренной мудростью и нежной меланхолией",
    },
  ],
};
