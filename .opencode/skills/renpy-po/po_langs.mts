/**
 * po_langs.mts — языковые профили системы локальных переводов po:translate.
 *
 * Один .po на язык обслуживает НЕСКОЛЬКО регионов (как es: España+LatAm),
 * поэтому профиль всегда задаёт нейтральный регистр, формы обращения,
 * эротический лексикон (18+ игра — регистр эротической прозы, не медицины)
 * и запреты для авточекера. Правила пишутся на EN — промпт к модели на EN
 * (проверено: русские/китайские инструкции дают акцент).
 *
 * Профили v1 — отправная точка; уточнение лексикона под носителя — задача
 * ревью (см. skill-review-es-po для испанского).
 */

export interface LangProfile {
  /** Код языка = имя файла po/<code>.po. */
  code: string;
  /** Человекочитаемое имя. */
  name: string;
  /** Готовый блок правил для system prompt (EN). */
  rules: string;
  /** Запрещённые слова/паттерны в сценах: regex + пояснение для отчёта. */
  forbidden: Array<[string, string]>;
  /** Стиль-примеры few-shot (проверенные переводы): EN -> TARGET. */
  fewshot: Array<[string, string]>;
  /** Дополнительные пункты для судьи (пер-языковая специфика). */
  judgeNotes: string;
  // КРИТ-ФИКС 2026-10-24: lenMin/lenMax (проверка длины перевода) ВЫПИЛЕНЫ —
  // ratio-лимит ломал CJK (1 иероглиф = слово) и короткие UI-кнопки.
}

/** Базовые правила, общие для всех языков. */
const COMMON = `HARD RULES:
- Output STRICT JSON only: {"es":"<translation>"}. The key is always "es" regardless of target language. No commentary.
- Translate ONLY the final user line (the msgid). Preceding quoted lines are scene context — do NOT translate them.
- NEVER wrap the line in quotation marks: the game renders speech on screen and the English source has no quotes. Use quotes ONLY where the English itself quotes something inside the text (mirror it).
- Keep %s/{name}/{i}...{/i} placeholders and Ren'Py text tags verbatim.
- Names and titles are never translated ("King Orwell" -> localized title + Orwell, the name itself untouched).
- Keep "..." as "...", keep repetitions and exclamations. NO length requirement: translation may be shorter or longer than the English line — never trim or pad to match length.
- Idioms are localized, not translated word-by-word.
- The emotion tag gives the speaker's delivery (Whispering, afraid = whispered; In a burst of passion = a cry). Tone fidelity outranks literalness.
- The translation must lose no concreteness: adverbs, possessives, locations, qualifiers all stay.
- Natural target-language word order — never mirror English syntax mechanically.`;

const EROTIC_NOTE = `Adult register: the game is explicit EROTIC PROSE, not medicine. Frank, never softened, never euphemized, nothing erotic dropped.`;

export const LANGS: Record<string, LangProfile> = {
  es: {
    code: "es",
    name: "Español (España + LatAm)",
    rules: `${COMMON}
- Address form: "tú" everywhere between lovers/friends/family/servants; "usted" ONLY for subjects addressing monarchs/high lords/priests (Su Majestad, su señoría). NEVER "vos"/voseo, NEVER "vosotros" — plural "you" is always "ustedes".
- Vocabulary neutral for both Spain and LatAm (prefer "computadora"). FORBIDDEN: "coger" (obscene in LatAm), "concha" (LatAm insult), "usteded" (typo).
- Gender agreement is CRITICAL: adjectives/participles/nicknames agree with the subject. Sarah is FEMALE (avergonzada, cansada, una borracha, como una niña). Determine the subject from the speaker name and pronouns in the English line.
${EROTIC_NOTE}
  FORBIDDEN in scenes: "penetrar", "pene", "vagina" (except lines by doctors/scientists).
  Lexicon (one term per scene, vary synonyms ACROSS scenes): pussy -> "coño" (scene) / "entre sus piernas" (soft narration); cunt -> ALWAYS "coño" (anatomy, even as insult, never "puta"); cock/dick -> "polla" / "verga" (harsher) / "miembro" (elevated narration); balls -> "huevos" / "cojones"; tits -> "tetas" (crude) / "pechos" (neutral) / "senos" (elevated); ass -> "culo" (crude) / "trasero" (soft); whore -> "puta"; slut -> "zorra" (ES) / "puta"; fuck (v.) -> "follar"; fuck! (shout) -> "¡Joder!" / "¡Carajo!" (NOT "¡Mierda!"); cum -> "leche" / "semilla" / "semen" (never "líquido seminal"); wet -> "mojada" / "empapada".
  "between her legs" -> "entre sus piernas" (NEVER "entre sus muslos").`,
    forbidden: [
      // Границы слов — через (?<!\p{L})/ (?!\p{L}): JS \b считает по ASCII-\w
      // и НЕ ловит "penetró" (ó не word-char → нет границы перед пробелом).
      ["(?<!\\p{L})penetr(?:ar|ó|o|a|ando|ada|ado|ación)(?!\\p{L})", "клинический penetrar"],
      ["\\bpene\\b", "клинический pene"],
      ["\\bvagina\\b", "клинический vagina"],
      ["\\bconcha\\b", "латино-мин concha"],
      ["\\bcoger\\b", "латино-мин coger"],
      ["\\bvosotros\\b", "форма España (файл для обоих регионов)"],
      ["\\busteded\\b", "опечатка usteded"],
      ["\\btestículos\\b", "клинический testículos"],
      ["entre sus muslos", "muslos вместо piernas"],
      [
        "\\bun (mente|cabeza|persona|cosa|mujer|noche|vez|vida|mano|voz|pieza|muerte)\\b",
        "род: un + существительное женского рода",
      ],
      ["\\bunas? (senos|manos|piernas|nalgas|ojos|orejas)\\b", "число/род: несогласованная форма"],
    ],
    fewshot: [
      [
        "A complicated flurry of emotions rocked her body as she began to slowly finger herself.",
        "Un complicado torbellino de emociones sacudió su cuerpo mientras comenzaba a masturbarse lentamente con los dedos.",
      ],
      [
        "A cock hungry slut...pretending to be a deck hand.",
        "Una zorra hambrienta de polla... fingiendo ser marinera.",
      ],
      [
        "A blood-curdling scream rings out across the silenced mass of slaves.",
        "Un grito desgarrador resuena sobre la masa enmudecida de esclavos.",
      ],
      [
        "A cheap ship whore who will suck my dick the moment I order her to?",
        "¿Una puta barata de barco que me chupará la polla apenas le dé la orden?",
      ],
    ],
    judgeNotes: `Spanish-specific: gender agreement (Sarah = FEMALE), tú not usted/usteded, no vosotros, neutral ES+LatAm vocabulary, lexicon table respected (no clinical terms in scenes, "cunt"="coño" anatomy not insult, "fuck!" shout = "¡Joder!" not "¡Mierda!").`,
  },

  de: {
    code: "de",
    name: "Deutsch",
    rules: `${COMMON}
- Address form: "du" between lovers/friends/family/servants; "Ihr/Sie" (formal) ONLY for subjects addressing monarchs/high lords/priests; nobles may be addressed "Euer Gnaden/Ihre Majestät". NEVER mix du and Ihr within one relationship unless the story marks an intimacy shift.
- Gender agreement: adjectives and participles must match gender/number/case of their nouns. Sarah is FEMALE (verlegen instead of verlegen... check: "she was tired but happy" -> "sie war müde, aber glücklich"; past participle "ge-X-t" has no gender but attributive adjectives decline: "die erschöpfte Frau").
${EROTIC_NOTE}
  FORBIDDEN in scenes: "Vagina", "Penis", "vaginal" (except doctors).
  Lexicon: pussy -> "Muschi" (scene) / "zwischen ihren Beinen" (soft); cunt -> "Muschi" (anatomy, even as insult); cock/dick -> "Schwanz" / "Dick" (harsher) / "Glied" (elevated); balls -> "Eier" / "Hoden" (clinical — avoid in scenes); tits -> "Titten" (crude) / "Brüste" (neutral); ass -> "Arsch" / "Hintern" (soft); whore -> "Hure"; slut -> "Schlampe"; fuck (v.) -> "ficken"; fuck! (shout) -> "Scheiße!" / "Verdammt!"; cum -> "Sperma" / "Milch"; wet -> "nass" / "durchweicht".`,
    forbidden: [
      ["\\b[Vv]agina\\b", "клинический Vagina"],
      ["\\b[Pp]enis\\b", "клинический Penis"],
      ["\\bHoden\\b", "клинический Hoden в сцене"],
      ["\\bvaginal\\b", "клинический vaginal"],
      ["\\b(Er|Sie) war (verlegen|müde|glücklich|wütend)\\b", "возможный род: субъект Sarah → sie war"],
    ],
    fewshot: [],
    judgeNotes: `German-specific: adjective ending agreement (declension), du/Ihr consistency, explicit register per lexicon, no clinical terms in scenes.`,
  },

  fr: {
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
    ],
    fewshot: [],
    judgeNotes: `French-specific: past-participle and adjective gender agreement (elle = féminin), tu/vous consistency, explicit register per lexicon.`,
  },

  it: {
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
    ],
    fewshot: [],
    judgeNotes: `Italian-specific: gender agreement (era stanca, una donna...), tu/Lei consistency, explicit register per lexicon.`,
  },

  pl: {
    code: "pl",
    name: "Polski",
    rules: `${COMMON}
- Address form: "ty" between lovers/friends/family/servants; "Pan/Pani" ONLY for subjects addressing monarchs/high lords/priests (Wasza Królewska Mość).
- Cases: nouns/adjectives must decline correctly for their grammatical case — check every adjective-noun pair. Sarah is FEMALE ("była zmęczona, ale szczęśliwa", "pijana kobieta").
${EROTIC_NOTE}
  FORBIDDEN in scenes: "pochwa", "penis", "penetrować" (except doctors).
  Lexicon: pussy -> "cipka" (scene) / "między jej nogami" (soft); cunt -> "cipka" (anatomy, even as insult); cock/dick -> "kutas" / "pała" (harsher); balls -> "jaja" / "jądra" (clinical — avoid); tits -> "cycki" (crude) / "piersi" (neutral); ass -> "dupa" / "pośladki" (soft); whore -> "suka"; slut -> "suka" / "dziwka"; fuck (v.) -> "ruchać" / "jebać"; fuck! (shout) -> "Kurwa!" ; cum -> "sperma"; wet -> "mokra" / "przemoczona".`,
    forbidden: [
      ["\\bpochwa\\b", "клинический pochwa"],
      ["\\bpenis\\b", "клинический penis"],
      ["(?<!\\p{L})penetr(?:owac|ować|acja)(?!\\p{L})", "клинический penetrować"],
      [
        "(?<!\\p{L})(?:był(?:a)? (?:zmęczon|szczęśliw)|penetr(?:ować|ował(?:a|i|o)?|uje|ują|acja|acji))",
        "клинический penetrować / pl-род",
      ],
    ],
    fewshot: [],
    judgeNotes: `Polish-specific: case agreement on every adjective-noun pair, ty/Pani consistency, explicit register per lexicon.`,
  },

  pt: {
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
    ],
    fewshot: [],
    judgeNotes: `Portuguese-specific: BR/PT-neutral vocabulary, você-based addressing (no tu-conjugation), gender agreement, explicit register per lexicon.`,
  },

  ru: {
    code: "ru",
    name: "Русский",
    rules: `${COMMON}
- Address form: "ты" between lovers/friends/family/servants; "Вы/Ваш" ONLY for subjects addressing monarchs/high lords/priests (Ваше Величество).
- Gender agreement: adjectives/participles agree with the subject. Sarah is FEMALE ("она устала, но была счастлива", "опьяневшая женщина").
${EROTIC_NOTE}
  FORBIDDEN in scenes: "вагина", "пенис", "проникновение" (except doctors).
  Lexicon: pussy -> "киска" (soft narration) / "пизда" (scene, crude); cunt -> "пизда" (anatomy, even as insult); cock/dick -> "член" / "хуй" (cruder); balls -> "яйца"/"яички"; tits -> "сиськи" (crude) / "грудь" (neutral); ass -> "жопа" / "попа" (soft); whore -> "шлюха"; slut -> "сучка"; fuck (v.) -> "трахать" / "ебать"; fuck! (shout) -> "Ёб твою мать!" / "Чёрт!"; cum -> "сперма" / "семя"; wet -> "мокрая" / "промокшая".`,
    forbidden: [
      // \b НЕ работает с кириллицей (ASCII \w) — полные слова ищем подстрокой.
      ["вагина", "клинический вагина"],
      ["пенис", "клинический пенис"],
      ["проникновени", "клиническое проникновение"],
      ["она была (?:уставш|счастлив)(?:а|о)", "род: она → -а"],
    ],
    fewshot: [],
    judgeNotes: `Russian-specific: gender agreement (она была ... -а), ты/Вы consistency, explicit register per lexicon.`,
  },

  ja: {
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
    fewshot: [],
    judgeNotes: `Japanese-specific: keigo consistency per relationship (casual for intimates, polite for monarchs), natural Japanese syntax (no translationese), explicit register per lexicon.`,
  },

  ko: {
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
    fewshot: [],
    judgeNotes: `Korean-specific: speech level consistency per relationship (반말 for intimates, 존댓말 for royalty), natural Korean syntax, explicit register per lexicon.`,
  },

  zh: {
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
    fewshot: [],
    judgeNotes: `Chinese-specific: pronoun consistency (她 = Sarah), natural Chinese syntax (no translationese), explicit register per lexicon.`,
  },
};

/** Профиль языка или осмысленный дефолт (es-подобный, если код не известен). */
export function langProfile(code: string): LangProfile {
  const p = LANGS[code];
  if (p) return p;
  throw new Error(
    `Неизвестный язык "${code}". Доступные: ${Object.keys(LANGS).join(", ")}. Профиль добавляется в po_langs.mts.`,
  );
}
