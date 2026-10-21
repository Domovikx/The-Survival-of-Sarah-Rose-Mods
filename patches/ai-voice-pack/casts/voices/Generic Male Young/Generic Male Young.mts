import type { CastContract } from "../../cast.types.mts";

export const GenericMaleYoung: CastContract = {
  name: "Generic Male Young",
  gender: "M",
  age: "20-30",
  who: "Молодой мужской голос около двадцати пяти лет, естественный, ровный, нейтральная разговорная речь, универсальный типаж.",
  instruct_en:
    "Male, 20-30 years old, medium height with a lean average build, clean-cut unremarkable face, short hair, relaxed posture, easy even stride",
  instruct_ru:
    "Мужской, 20-30 лет, средний рост, поджарое обычное телосложение, аккуратная ничем не примечательная внешность, короткие волосы, расслабленная осанка, лёгкая ровная походка",
  texts: [
    {
      text: "Слушай, давай без церемоний. Ты мне поможешь, я тебе — по рукам? Здесь не любят долгих разговоров и лишних слов, так что всё просто: услуга за услугу, и никто никому не должен сверх меры. Ну как, идёт?",
      emotion_en: "Casually straightforward, with easy deal-making confidence",
      emotion_ru: "Непринуждённо-деловито, с лёгкой уверенностью торга",
    },
    {
      text: "Сегодня рынок гудел, как улей: торговцы, стража, карманники — все при деле, и каждый хочет урвать свой кусок. Я еле протиснулся к прилавку с рыбой и там, кстати, узнал новость, которая тебе точно пригодится.",
      emotion_en: "Lively conversational, with eager news-sharing enthusiasm",
      emotion_ru: "Оживлённо-разговорно, с задорным желанием поделиться новостью",
    },
    {
      text: "Я не знаю, что будет завтра, и не хочу загадывать. Но сегодня у нас есть крыша над головой, тёплый ужин и хорошая компания, а остальное подождёт. Такое случается не каждый день, так что я стараюсь этим наслаждаться.",
      emotion_en: "Contentedly laid-back, with simple warm appreciation of the moment",
      emotion_ru: "Спокойно-довольственно, с простой тёплой признательностью за момент",
    },
  ],
};
