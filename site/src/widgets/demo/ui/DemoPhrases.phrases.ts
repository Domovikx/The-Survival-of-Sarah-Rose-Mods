/**
 * СГЕНЕРИРОВАНО — руками не править.
 *
 * Демо-фразы сайта — ОТДЕЛЬНЫЙ кейс переводов: они берутся строго из
 * `patches/ai-voice-pack/po/<lang>.po` (из этих msgstr сгенерирован звук,
 * uid = md5 английского текста). Общий каталог сайта (`i18n.locales.ts`)
 * их не содержит — чтобы UI-переводы и игровые реплики не путались.
 *
 * Перегенерация: node .opencode/skills/site-locales/gen_demo_phrases.mts
 * Порядок фраз и uid — `demo-manifest.json` (рядом с gen_demo_phrases.mts).
 * Соответствие po стережёт `site/e2e/demo.spec.ts`.
 */
import type { Lang } from "@/shared/config/languages";

export type DemoPhrase = {
  /** uid = md5(английского текста) — имя файла аудио. */
  uid: string;
  /** Имя спикера по языкам (из po). */
  speaker: Record<Lang, string>;
  /** Текст реплики по языкам (из po). */
  text: Record<Lang, string>;
};

export const DEMO_PHRASES: readonly DemoPhrase[] = [
  {
    uid: "583f25a13f0bd59e8f6edc8e12f28c62",
    speaker: {
      en: "Sarah",
      zh: "莎拉",
      ru: "Сара",
      es: "Sarah",
      pt: "Sarah",
      de: "Sarah",
      ja: "サラ",
      fr: "Sarah",
      pl: "Sarah",
      ko: "사라",
      it: "Sarah",
    },
    text: {
      en: "But seriously, Thomas, you should listen to Dad at least some of the time. He's only trying to do what is best for us.",
      zh: "但说真的，托马斯，你至少该听爸爸的话。他只是在为我们好。",
      ru: "Но если серьёзно, Томас, тебе стоит хотя бы иногда слушать папу. Он ведь просто хочет сделать для нас то, что лучше.",
      es: "Pero en serio, Thomas, deberías escuchar a Papá al menos algunas veces. Solo está tratando de hacer lo mejor para nosotros.",
      pt: "Mas sério, Thomas, você deveria ouvir o papai pelo menos às vezes. Ele só está tentando fazer o que é melhor para nós.",
      de: "Aber im Ernst, Thomas, du solltest wenigstens manchmal auf Papa hören. Er will doch nur das Beste für uns tun.",
      ja: "でも、マジでトーマス。パパの言うこと、少なくとも半分くらいは聞いてくれない？ただ我々のためを考えてるだけだよ",
      fr: "Mais sérieusement, Thomas, tu devrais écouter ton père au moins parfois. Il essaie juste de faire ce qui est le mieux pour nous.",
      pl: "Prawda? Thomas, powinieneś słuchać Taty przynajmniej w pewnym stopniu. On próbuje po prostu zrobić to, co dla nas najlepsze.",
      ko: "하지만 진지하게 말해, 토머스야. 아빠의 말을 적어도 일부는 들어야 해. 그는 우리 모두에게 가장 좋은 일을 하려는 거니까.",
      it: "Ma seriamente, Thomas, dovresti ascoltare almeno una parte di ciò che dice papà. Sta solo cercando di fare il meglio per noi.",
    },
  },
  {
    uid: "22f42b557104f59fbc0d13859cbb8441",
    speaker: {
      en: "Kate",
      zh: "凯特",
      ru: "Кейт",
      es: "Kate",
      pt: "Kate",
      de: "Kate",
      ja: "ケイト",
      fr: "Kate",
      pl: "Kate",
      ko: "케이트",
      it: "Kate",
    },
    text: {
      en: "It's a little late to start pretending to be modest now, Sarah.",
      zh: "现在才开始装模作样地谦虚，是不是有点太晚了，莎拉？",
      ru: "Сара, уже немного поздно начинать притворяться скромной.",
      es: "Ya es demasiado tarde para empezar a fingir modestia ahora, Sarah.",
      pt: "Já está um pouco tarde para começar a fingir que é modesta agora, Sarah.",
      de: "Es ist jetzt ein wenig zu spät, um anzufangen, so zu tun, als wärst du bescheiden, Sarah.",
      ja: "今さら慎ましさを装い始めるのは、ちょっと遅いわね、サラ。",
      fr: "Il est un peu tard pour commencer à faire semblant d'être modeste maintenant, Sarah.",
      pl: "Trochę późno, żeby teraz zacząć udawać skromność, Sarah.",
      ko: "이제 와서 겸손한 척하기엔 좀 늦지 않았니, 사라?",
      it: "È un po' tardi per iniziare a fare finta di essere modesta adesso, Sarah.",
    },
  },
  {
    uid: "38eec748aafaa5e83d3b039c02675f0e",
    speaker: {
      en: "King Orwell Rose",
      zh: "奥威尔·罗斯国王",
      ru: "Король Орвелл Роуз",
      es: "Rey Orwell Rose",
      pt: "Rei Orwell Rose",
      de: "König Orwell Rose",
      ja: "オーウェル・ローズ王",
      fr: "Roi Orwell Rose",
      pl: "Król Orwell Rose",
      ko: "오웰 로즈 왕",
      it: "Re Orwell Rose",
    },
    text: {
      en: "Anyone can be a king in the easy times. It's the bad times that a king needs to be ready for. And your brother isn't ready.",
      zh: "和平年代谁都能当国王，可乱世才见真章。你弟弟还没准备好。",
      ru: "Любой может стать королём в спокойные времена. Но именно к трудным временам король и должен быть готов. А твой брат к ним не готов.",
      es: "Cualquiera puede ser rey en tiempos fáciles. Son los malos momentos para los que un rey debe estar preparado. Y tu hermano no está listo.",
      pt: "Qualquer um pode ser rei nos tempos fáceis. É nos tempos ruins que um rei precisa estar pronto. E seu irmão não está pronto.",
      de: "Jeder kann König sein, wenn es leicht ist. Aber in schlechten Zeiten braucht man einen König, der bereit ist. Und dein Bruder ist nicht bereit.",
      ja: "誰でも王になれる時代もある。だが、試練の時代こそが真の王を問う。そして君の兄は未だその準備ができていない。",
      fr: "N'importe qui peut être roi en temps de paix. C'est aux mauvais moments qu'un roi doit être prêt. Et ton frère ne l'est pas.",
      pl: "Ktoś może zostać królem w dobre czasy, ale to złe czasy wymagają od króla gotowości. A Twój brat nie jest gotowy.",
      ko: "어떤 사람이라도 왕이 될 수 있습니다. 평온할 때요. 하지만 어려운 시기를 대비하지 못한 당신의 형제는 그렇지 않습니다.",
      it: "Chiunque può essere un re nei tempi facili. È nei tempi bui che serve un re pronto a tutto, e tuo fratello non lo è.",
    },
  },
];
