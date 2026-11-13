/**
 * tone_lexicon.mts — лексикон «клинического» регистра + механические гейты правки.
 *
 * Зачем: корпус переводила локальная модель, и местами вместо художественной
 * прозы 18+ получался медицинский протокол («половые органы оставались
 * открытыми» вместо «лоно оставалось открытым»). Здесь — ДЕТЕРМИНИРОВАННАЯ
 * часть лечения: какие слова считать клиникой (по языкам) и что обязана
 * сохранить правка, чтобы её можно было принимать автоматически.
 *
 * Разметка LLM живёт в tone_fix.mts; этот модуль без сети и без ФС — его
 * проверяют tone_lexicon.test.mts.
 *
 * Термины сгруппированы «по корню», потому что языки флективные: русское
 * «влагалищ» покрывает влагалище/влагалища/влагалищем. Для коротких корней,
 * которые живут внутри обычных слов («анус» в «ост**анус**ь»), стоят
 * границы слова — иначе детектор даёт ложные срабатывания (поймано 2026-11-13).
 */

/** Один клинический термин: имя для отчёта + шаблон поиска. */
export interface ClinicalTerm {
  name: string;
  re: RegExp;
  /**
   * weak = слово нормальное для жанра (клитор, матка, Scheide), его трогаем
   * только если в строке есть и сильная клиника: иначе правка ради правки.
   */
  weak?: boolean;
  /**
   * Для «мягких» слов: при каких словах ОРИГИНАЛА это слово — не смягчение,
   * а прямой эквивалент («сучка» для slut — норма, для bitch — смягчение).
   */
  okEn?: RegExp;
}

/**
 * Клиника по языкам. Сильные термины — то, что читается как выписка из
 * медкарты; weak — пограничные, сами по себе не дефект.
 */
export const CLINICAL: Record<string, ClinicalTerm[]> = {
  ru: [
    { name: "половые органы", re: /(?<![\p{L}])полов(?:ые|ых|ым|ыми|ой|ого|ому|ая|ое)\s+(?:орган|губ)/iu },
    {
      name: "половой акт",
      re: /(?<![\p{L}])полов(?:ой|ым|ого|ые|ых|ая|ое)\s+(?:акт|сношени|связ|жизн|член|возбуждени)/iu,
    },
    // Влагалище, эрекция, промежность — нормальные слова для этого жанра
    // (решение владельца 2026-11-13: «я бы убрал из ban»). Слабое = само по
    // себе не дефект и в запрет модели не попадает; правим только за компанию
    // с настоящей канцелярщиной. Держим их в лексиконе, чтобы «влагалище +
    // пенис» в одной строке всё ещё считалось медицинским протоколом.
    { name: "влагалище", re: /(?<![\p{L}])влагалищ/iu, weak: true },
    { name: "вагина", re: /(?<![\p{L}])вагин/iu },
    { name: "пенис", re: /(?<![\p{L}])пенис/iu },
    { name: "эрекция", re: /(?<![\p{L}])эрекц/iu, weak: true },
    { name: "эякуляция", re: /(?<![\p{L}])эякуля/iu },
    { name: "семяизвержение", re: /(?<![\p{L}])семяизвержени/iu },
    { name: "копуляция", re: /(?<![\p{L}])копуляц/iu },
    { name: "совокупление", re: /(?<![\p{L}])совокуплени/iu },
    // «Мастурбация»/«дрочка» — допустимые варианты (владелец 2026-11-13),
    // поэтому слабое: не запрещаем модель, но и не считаем строку дефектной.
    { name: "мастурбация", re: /(?<![\p{L}])мастурбац/iu, weak: true },
    { name: "онанизм", re: /(?<![\p{L}])онанизм/iu },
    // «Анус» местами допустим (владелец 2026-11-13) — слабое: не дефект само по
    // себе, но в строке с настоящей канцелярщиной правится за компанию.
    { name: "анус", re: /(?<![\p{L}])анус(?:а|у|ом|е|ы|ов|ам|ами|ах)?(?![\p{L}])/iu, weak: true },
    { name: "задний проход", re: /(?<![\p{L}])задн(?:ий|его|ему|им|ем)\s+проход/iu },
    { name: "прямая кишка", re: /(?<![\p{L}])прям(?:ая|ой|ую)\s+кишк/iu },
    { name: "промежность", re: /(?<![\p{L}])промежност/iu, weak: true },
    { name: "гениталии", re: /(?<![\p{L}])генитал/iu },
    { name: "мошонка", re: /(?<![\p{L}])мошонк/iu },
    {
      name: "оральный секс",
      re: /(?<![\p{L}])оральн(?:ый|ого|ым|ом|ая|ой|ую|ые|ых)\s+секс(?:а|у|ом|е)?(?![\p{L}])/iu,
    },
    {
      name: "анальный секс",
      re: /(?<![\p{L}])анальн(?:ый|ого|ым|ом|ая|ой|ую|ые|ых)\s+секс(?:а|у|ом|е)?(?![\p{L}])/iu,
    },
    { name: "клитор", re: /(?<![\p{L}])клитор/iu, weak: true },
    { name: "матка", re: /(?<![\p{L}])матк(?:а|и|у|ой|е|ам|ами|ах)(?![\p{L}])/iu, weak: true },
    { name: "лобок", re: /(?<![\p{L}])лоб(?:ок|ка|ком|ке)(?![\p{L}])/iu, weak: true },
  ],
  de: [
    { name: "Geschlechtsorgan", re: /Geschlechtsorgan/iu },
    { name: "Geschlechtsteil", re: /Geschlechtsteil/iu },
    { name: "Vagina", re: /(?<![\p{L}])Vagina/iu },
    { name: "Penis", re: /(?<![\p{L}])Penis/iu },
    { name: "Erektion", re: /Erektion/iu },
    { name: "Ejakulation", re: /Ejakulation|ejakulie/iu },
    { name: "Anus", re: /(?<![\p{L}])Anus(?![\p{L}])/iu },
    { name: "After", re: /(?<![\p{L}])After(?![\p{L}])/iu },
    { name: "Damm", re: /(?<![\p{L}])Damm(?![\p{L}])/iu },
    { name: "Genitalien", re: /Genital/iu },
    { name: "Geschlechtsverkehr", re: /Geschlechtsverkehr/iu },
    { name: "Oralsex", re: /Oralsex|oralen?\s+Sex/iu },
    { name: "Analsex", re: /Analsex|analen?\s+Sex/iu },
    // «Masturbieren» — нормальное слово для действия (меню EN «Masturbate»),
    // замены-сленга нет. Слабое: само по себе не дефект (2026-11-13).
    { name: "Masturbation", re: /Masturbation|masturbier/iu, weak: true },
    { name: "Hodensack", re: /Hodensack/iu },
    { name: "Klitoris", re: /Klitoris/iu, weak: true },
    { name: "Scheide", re: /(?<![\p{L}])Scheide(?![\p{L}])/iu, weak: true },
  ],
  es: [
    { name: "órganos genitales", re: /órganos?\s+genital/iu },
    { name: "genitales", re: /(?<![\p{L}])genitales(?![\p{L}])/iu },
    { name: "vagina", re: /(?<![\p{L}])vagina/iu },
    { name: "pene", re: /(?<![\p{L}])pene(?![\p{L}])/iu },
    { name: "erección", re: /erecci[óo]n/iu },
    { name: "eyaculación", re: /eyaculaci[óo]n|eyacul[ao]/iu },
    { name: "ano", re: /(?<![\p{L}])ano(?![\p{L}])/iu },
    { name: "perineo", re: /perineo/iu },
    // Границы обязательны: `coito` внутри «poscoito» давал ложный флаг (2026-11-13).
    { name: "acto sexual", re: /acto\s+sexual|(?<![\p{L}])coito(?![\p{L}])|relaci[óo]n\s+sexual/iu },
    { name: "sexo oral", re: /sexo\s+oral/iu },
    { name: "sexo anal", re: /sexo\s+anal/iu },
    { name: "masturbación", re: /masturbaci[óo]n|masturba/iu, weak: true },
    { name: "escroto", re: /escroto/iu },
    { name: "clítoris", re: /cl[íi]toris/iu, weak: true },
  ],
  fr: [
    { name: "organes génitaux", re: /organes?\s+g[ée]nital/iu },
    { name: "génitaux", re: /(?<![\p{L}])g[ée]nitaux(?![\p{L}])/iu },
    { name: "vagin", re: /(?<![\p{L}])vagin/iu },
    { name: "pénis", re: /(?<![\p{L}])p[ée]nis/iu },
    { name: "érection", re: /[ée]rection/iu },
    { name: "éjaculation", re: /[ée]jacul/iu },
    { name: "anus", re: /(?<![\p{L}])anus(?![\p{L}])/iu },
    { name: "périnée", re: /p[ée]rin[ée]e/iu },
    { name: "rapport sexuel", re: /rapport\s+sexuel|acte\s+sexuel/iu },
    { name: "sexe oral", re: /sexe\s+oral/iu },
    { name: "sexe anal", re: /sexe\s+anal/iu },
    { name: "masturbation", re: /masturb/iu, weak: true },
    { name: "scrotum", re: /scrotum/iu },
    { name: "clitoris", re: /clitoris/iu, weak: true },
  ],
  it: [
    { name: "organi genitali", re: /organ[oi]\s+genital/iu },
    { name: "genitali", re: /(?<![\p{L}])genitali(?![\p{L}])/iu },
    { name: "vagina", re: /(?<![\p{L}])vagina/iu },
    { name: "pene", re: /(?<![\p{L}])pene(?![\p{L}])/iu },
    { name: "erezione", re: /erezione/iu },
    { name: "eiaculazione", re: /eiaculazion|eiacul[ao]/iu },
    { name: "ano", re: /(?<![\p{L}])ano(?![\p{L}])/iu },
    { name: "perineo", re: /perineo/iu },
    { name: "rapporto sessuale", re: /rapporto\s+sessuale|atto\s+sessuale/iu },
    { name: "sesso orale", re: /sesso\s+orale/iu },
    { name: "sesso anale", re: /sesso\s+anale/iu },
    { name: "masturbazione", re: /masturbazion|masturba/iu, weak: true },
    { name: "scroto", re: /scroto/iu },
    { name: "clitoride", re: /clitoride/iu, weak: true },
  ],
  pl: [
    { name: "narządy płciowe", re: /narz[ąa]d[\p{L}]*\s+p[łl]ciow/iu },
    { name: "pochwa", re: /(?<![\p{L}])pochw/iu },
    { name: "penis", re: /(?<![\p{L}])penis/iu },
    { name: "erekcja", re: /erekcj|wzw[óo]d/iu },
    { name: "ejakulacja", re: /ejakulacj|wytrysk/iu },
    { name: "odbyt", re: /(?<![\p{L}])odbyt(?:u|em|cie)?(?![a-ząćęłńóśźż])/iu },
    { name: "krocze", re: /(?<![\p{L}])krocz/iu },
    { name: "stosunek", re: /stosunek\s+p[łl]ciow|akt\s+p[łl]ciow/iu },
    { name: "seks oralny", re: /seks\s+oraln/iu },
    { name: "seks analny", re: /seks\s+analn/iu },
    { name: "masturbacja", re: /masturbacj|masturbu/iu, weak: true },
    { name: "moszna", re: /(?<![\p{L}])moszn/iu },
    { name: "łechtaczka", re: /[łl]echtaczk/iu, weak: true },
  ],
  pt: [
    { name: "órgãos genitais", re: /[óo]rg[ãa]os?\s+genital/iu },
    { name: "genitais", re: /(?<![\p{L}])genitais(?![\p{L}])/iu },
    { name: "vagina", re: /(?<![\p{L}])vagina/iu },
    { name: "pênis", re: /(?<![\p{L}])p[êe]nis/iu },
    { name: "ereção", re: /ere[çc][ãa]o/iu },
    { name: "ejaculação", re: /ejacula[çc][ãa]o|ejacul/iu },
    { name: "ânus", re: /(?<![\p{L}])[âa]nus(?![\p{L}])/iu },
    { name: "períneo", re: /per[íi]neo/iu },
    { name: "relação sexual", re: /rela[çc][ãa]o\s+sexual|ato\s+sexual/iu },
    { name: "sexo oral", re: /sexo\s+oral/iu },
    { name: "sexo anal", re: /sexo\s+anal/iu },
    { name: "masturbação", re: /masturba[çc][ãa]o|masturba/iu, weak: true },
    { name: "escroto", re: /escroto/iu },
    { name: "clitóris", re: /clit[óo]ris/iu, weak: true },
  ],
  ja: [
    { name: "性器", re: /性器/iu },
    { name: "膣", re: /膣/iu },
    { name: "陰茎", re: /陰茎/iu },
    { name: "勃起", re: /勃起/iu },
    { name: "射精", re: /射精/iu },
    { name: "肛門", re: /肛門/iu },
    { name: "会陰", re: /会陰/iu },
    { name: "性交", re: /性交/iu },
    { name: "オーラルセックス", re: /オーラルセックス/iu },
    { name: "アナルセックス", re: /アナルセックス/iu },
    { name: "自慰", re: /自慰|マスターベーション/iu, weak: true },
    { name: "睾丸", re: /睾丸/iu },
    { name: "陰核", re: /陰核|クリトリス/iu, weak: true },
  ],
  ko: [
    { name: "성기", re: /성기/iu },
    { name: "질", re: /(?<![\p{L}])질(?:벽|구)?(?![\p{L}])/iu }, // «질» как отдельное слово
    { name: "음경", re: /음경/iu },
    { name: "발기", re: /발기/iu },
    { name: "사정", re: /사정/iu },
    { name: "항문", re: /항문/iu },
    { name: "회음", re: /회음/iu },
    { name: "성교", re: /성교/iu },
    { name: "오럴섹스", re: /오럴\s*섹스/iu },
    { name: "애널섹스", re: /애널\s*섹스/iu },
    { name: "자위", re: /자위행위|마스터베이션/iu, weak: true },
    { name: "고환", re: /고환/iu },
    { name: "음핵", re: /음핵|클리토리스/iu, weak: true },
  ],
  zh: [
    { name: "生殖器", re: /生殖器/iu },
    { name: "阴道", re: /陰道|阴道/iu },
    { name: "阴茎", re: /陰莖|阴茎/iu },
    { name: "勃起", re: /勃起/iu },
    { name: "射精", re: /射精/iu },
    { name: "肛门", re: /肛門|肛门/iu },
    { name: "会阴", re: /會陰|会阴/iu },
    { name: "性交", re: /性交/iu },
    { name: "口交", re: /口交/iu },
    { name: "肛交", re: /肛交/iu },
    { name: "自慰", re: /自慰|手淫/iu, weak: true },
    { name: "睾丸", re: /睾丸/iu },
    { name: "阴蒂", re: /陰蒂|阴蒂/iu, weak: true },
  ],
};

/**
 * Механические формы, на которых ломается ПОДСТАНОВКА: редактор меняет слово,
 * но не соседние слова, которые должны с ним согласоваться или которых требует
 * предлог. Найдено 2026-11-13 на прогоне индекс-переводчиком: «твоё киска»,
 * «её между ног оказались открыты», «прижала рот к между ног Еулы».
 * Судья-одноклассник такое пропускает (он согласен сам с собой), поэтому это
 * отдельный, детерминированный гейт.
 */
const RU_NEUTER_DET = /(?<![\p{L}])(твоё|моё|своё|наше|ваше|одно)\s+([а-яё]{3,})(?=$|[\s.,!?;:—»)])/giu;
/** Нейтральные на -мя: «твоё имя», «моё время» — не ошибка. */
const RU_MYA_NEUTER = new Set(["имя", "время", "пламя", "знамя", "племя", "семя", "темя", "бремя", "вымя", "стремя"]);
const RU_PREP_BEFORE_MEZHDU =
  /(?<![\p{L}])(?:к|ко|в|во|на|от|до|из|с|со|у|о|об|при|для|под|над|за|через)\s+между(?![\p{L}])/iu;
const RU_POSS_BEFORE_MEZHDU = /(?<![\p{L}])(?:её|его|их|мою|твою|свою)\s+между\s+ног(?:и|у|ой)?(?![\p{L}])/iu;

/** Сломанные формы подстановки (сейчас только ru — только там есть корпус). */
export function shapeGates(line: string, lang: string): string[] {
  if (lang !== "ru") return [];
  const out: string[] = [];
  for (const m of line.matchAll(RU_NEUTER_DET)) {
    const noun = m[2]!.toLowerCase();
    if (RU_MYA_NEUTER.has(noun)) continue;
    if (/[ая]$/u.test(noun)) out.push(`согласование: «${m[1]} ${m[2]}» — средний род при слове женского рода`);
  }
  if (RU_PREP_BEFORE_MEZHDU.test(line)) out.push("предлог стоит перед «между» без существительного («к между ног»)");
  if (RU_POSS_BEFORE_MEZHDU.test(line)) out.push("порядок слов: нужно «между её ног», а не «её между ног»");
  return out;
}

/** Языки, для которых есть лексикон. */
export const LEXICON_LANGS: string[] = Object.keys(CLINICAL);

/**
 * Слова, которые нельзя писать в переводе — для ПРОМПТА модели (жёсткое
 * ограничение в родном формате Index-Translate). Единственный источник —
 * лексикон выше: раньше запрет был переписан руками в `tone_native.mts` и
 * разъехался с детектором (правка владельца 2026-11-13 про влагалище/эрекцию
 * чинилась бы в двух местах). Слабые термины в запрет не попадают.
 */
export function banTerms(lang: string): string[] {
  return (CLINICAL[lang] ?? []).filter((t) => !t.weak).map((t) => t.name);
}

/**
 * Регистр в две стороны от нормы: не только «слишком медицински», но и
 * «слишком по-детски» (сучка при bitch, попка при ass) и «слишком грубо»
 * (пизда при her sex). Классы сравниваются с ОРИГИНАЛОМ: смягчение при
 * грубом EN и огрубление при нейтральном EN — одинаково дефект.
 */
export const SOFT: Record<string, ClinicalTerm[]> = {
  ru: [
    // «Slut.» → «Сучка.» — прямой эквивалент, а не смягчение (см. okEn).
    { name: "сучка", re: /(?<![\p{L}])сучк/iu, okEn: /(?<![\p{L}])slut/iu },
    { name: "попка", re: /(?<![\p{L}])поп(?:к|очк)/iu },
    { name: "пиписька/писюн", re: /пиписьк|письк|писюн|писечк/iu },
    { name: "между ножек", re: /между\s+ножек/iu },
  ],
  de: [
    { name: "Popo", re: /(?<![\p{L}])Popo(?![\p{L}])/iu },
    { name: "Pimmel", re: /Pimmel/iu },
    { name: "Kitzler", re: /Kitzler/iu },
    { name: "Pipimann", re: /Pipimann|Pipi(?![\p{L}])/iu },
  ],
  es: [
    { name: "pito", re: /(?<![\p{L}])pito(?![\p{L}])/iu },
    { name: "culito", re: /culito|potito/iu },
    { name: "chocho", re: /(?<![\p{L}])chocho(?![\p{L}])/iu },
  ],
  fr: [
    { name: "zizi", re: /(?<![\p{L}])z[ée]zette|(?<![\p{L}])zizi/iu },
    { name: "minou", re: /(?<![\p{L}])minou/iu },
    { name: "foufoune", re: /foufoune/iu },
    { name: "cucul", re: /cucul/iu },
  ],
  it: [
    { name: "pisello", re: /pisello/iu },
    { name: "patatina", re: /patatina|passerina/iu },
    { name: "culetto", re: /culetto/iu },
  ],
  pl: [
    { name: "siusiak", re: /siusiak/iu },
    { name: "pupcia", re: /pupci|tyłeczek/iu },
  ],
  pt: [
    { name: "pilinha", re: /pilinha|piru(?![\p{L}])/iu },
    { name: "xoxota", re: /xoxota/iu },
  ],
  ja: [
    { name: "おちんちん", re: /おちんちん|ちんちん|ちんこ/iu },
    { name: "おまた", re: /おまた|お股/iu },
  ],
  ko: [
    { name: "고추", re: /고추/iu },
    { name: "잠지", re: /잠지/iu },
  ],
  zh: [
    { name: "小弟弟", re: /小弟弟|小雞雞|小鸡鸡/iu },
    // «下身» — обычное «низ тела» (и часть «俯下身» = наклониться), не эвфемизм
    // (2026-11-13). Эвфемизм здесь только «私处/私處» = «интимное место».
    { name: "私处", re: /私處|私处/iu },
  ],
};

/** Грубая лексика: дефект, когда оригинал её не содержит. */
export const VULGAR: Record<string, ClinicalTerm[]> = {
  ru: [
    { name: "пизда", re: /(?<![\p{L}])пизд/iu },
    { name: "манда", re: /(?<![\p{L}])манд[аыуеой]/iu },
    { name: "хуй", re: /(?<![\p{L}])ху[йяеёю](?![\p{L}])/iu },
  ],
  de: [
    { name: "Fotze", re: /Fotze/iu },
    { name: "Schwanz", re: /Schwanz/iu },
  ],
  // es: «coño»/«polla» — обычная лексика испанской эротики, а не огрубление
  // (книга переводит «her sex» как «киска»; «le chupé la polla» — норма для
  // «blew»). Флаги сняты 2026-11-13 после просмотра строк глазами.
  es: [],
  fr: [
    { name: "chatte", re: /(?<![\p{L}])chatte(?![\p{L}])/iu },
    { name: "bite", re: /(?<![\p{L}])bite(?![\p{L}])/iu },
  ],
  it: [
    // «figa/fica» — книжное слово для «pussy», а не огрубление (2026-11-13).
    { name: "cazzo", re: /cazzo/iu },
  ],
  pl: [
    { name: "pizda", re: /(?<![\p{L}])pizd/iu },
    // Границы обязательны: «chuj» ловился внутри «wdmuchuje» (2026-11-13).
    { name: "kutas", re: /(?<![\p{L}])kutas(?![\p{L}])|(?<![\p{L}])chuj/iu },
  ],
  pt: [
    // «buceta» — книжное слово для «pussy», а не огрубление (2026-11-13).
    { name: "caralho", re: /caralho/iu },
  ],
  ja: [{ name: "まんこ", re: /まんこ/iu }],
  // ko: «보지» — ещё и форма глагола «видеть» («보지 않으려는»), без морфологии
  // не отличить; 3 ложных флага из 3 (2026-11-13) — детектор снят.
  ko: [],
  zh: [
    // Только 屄: «逼» — обычный глагол «вынуждать» (逼问/逼迫), не мат (2026-11-13).
    { name: "屄", re: /屄/u },
    { name: "鸡巴", re: /雞巴|鸡巴/u },
  ],
};

/**
 * Уровень оригинала. Книга переводит «грубое уместно», поэтому смягчение
 * допустимо только там, где EN и правда мягкий (bottom, privates, cute…),
 * а огрубление — только там, где EN и правда грубый (cunt, bitch, fuck…).
 */
const EN_BLUNT =
  /(?<![\p{L}])(cunt|bitch\w*|slut\w*|whore\w*|fuck\w*|shit\w*|dick|prick|twat|arsehole|asshole|bastard|bollocks)(?![\p{L}])/iu;
const EN_SOFT = /(?<![\p{L}])(bottom|bum|privates?|private parts|little|tiny|cute|bits|thingy|down there)(?![\p{L}])/iu;

/** Смягчение/огрубление относительно оригинала — повод для правки. */
export function registerMismatch(line: string, en: string, lang: string): string[] {
  const soft = (SOFT[lang] ?? []).filter((t) => t.re.test(line) && !(t.okEn && t.okEn.test(en))).map((t) => t.name);
  const vulgar = (VULGAR[lang] ?? []).filter((t) => t.re.test(line)).map((t) => t.name);
  const out: string[] = [];
  if (soft.length && !EN_SOFT.test(en)) out.push(...soft.map((t) => `${t} (мягче оригинала)`));
  if (vulgar.length && !EN_BLUNT.test(en)) out.push(...vulgar.map((t) => `${t} (грубее оригинала)`));
  return out;
}

/** Первое совпадение списка с точным текстом (для передачи модели). */
const hit = (list: ClinicalTerm[], text: string, lang: string): { name: string; text: string } | null => {
  for (const t of list) {
    const m = new RegExp(t.re.source, t.re.flags.replace(/[gy]/u, "")).exec(text);
    if (m) return { name: t.name, text: widen(text, m, lang) };
  }
  return null;
};

/**
 * Что чинить в строке, в порядке важности: медицинщина → огрубление →
 * смягчение. Возвращает точный текст-вхождение и причину, чтобы модель знала
 * направление правки, а не только слово.
 */
export function nextDefect(line: string, en: string, lang: string): { term: string; why: string } | null {
  const clin = findOccurrences(line, lang)[0];
  if (clin) return { term: clin.text, why: "clinical, reads like a medical report" };
  if (!EN_BLUNT.test(en)) {
    const v = hit(VULGAR[lang] ?? [], line, lang);
    if (v) return { term: v.text, why: "cruder than the English source" };
  }
  if (!EN_SOFT.test(en)) {
    const s = hit(SOFT[lang] ?? [], line, lang);
    if (s) return { term: s.text, why: "softer and more childish than the English source" };
  }
  return null;
}

/** Дефект ли строка целиком (для детектора кандидатов). */
export function isDefective(line: string, en: string, lang: string): boolean {
  return isClinical(line, lang) || registerMismatch(line, en, lang).length > 0 || metaLeak(line).length > 0;
}

/**
 * Служебный мусор в САМОМ переводе — рассуждение модели, вклеенное в текст.
 * Найдено 2026-11-13 в `ru` (3 строки): «У Самайры (женский род) заканчивалось
 * время», «Гидеон… был мужчиной (мужской род), а повествователь — женским
 * персонажем». Механический гейт: в переводе не должно быть пояснений о роде,
 * о том, кто рассказчик, и служебных префиксов «EN:/Перевод:».
 */
export function metaLeak(text: string): string[] {
  const out: string[] = [];
  if (/\((?:муж|жен)ск\S*\s+род\S*\)/iu.test(text)) out.push("пометка о роде в скобках");
  if (/(?:повествовател|рассказчик)\p{L}*\s*(?:—|это|был|была)/iu.test(text)) out.push("пояснение про повествователя");
  const prefixed = text
    .split(String.fromCharCode(10))
    .some((l) => /^(?:RU|EN|Перевод|Translation)[:：]/u.test(l.trim()));
  if (prefixed) out.push("служебный префикс");
  if (/(?<![\p{L}])(?:в оригинале|исходн\p{L}*\s+текст\p{L}*)(?![\p{L}])/iu.test(text)) out.push("ссылка на оригинал");
  return out;
}

/** Все сильные термины строки (для отчёта) + признак «есть ли слабые». */
export function findTerms(text: string, lang: string): { strong: string[]; weak: string[] } {
  const strong: string[] = [];
  const weak: string[] = [];
  for (const t of CLINICAL[lang] ?? []) {
    // Шаблоны с /g не переиспользуем: exec без /g ищет с начала — этого хватает
    // для «есть/нет», а сами вхождения правке не нужны.
    if (t.re.test(text)) (t.weak ? weak : strong).push(t.name);
  }
  return { strong, weak };
}

/**
 * Расширяет совпадение до границ слова: шаблоны ловят основу («влагалищ»,
 * «эрекц»), а модели нужно реальное слово из строки («влагалище»,
 * «эрекцией»), иначе фрагмент не находится и она сочиняет своё.
 * Для иероглифических языков расширение не делаем — там нет границ слова.
 */
const CJK_LANGS = new Set(["ja", "ko", "zh"]);
function widen(text: string, m: RegExpExecArray, lang: string): string {
  if (CJK_LANGS.has(lang)) return m[0];
  let start = m.index;
  let end = m.index + m[0].length;
  while (start > 0 && /\p{L}/u.test(text[start - 1])) start--;
  while (end < text.length && /\p{L}/u.test(text[end])) end++;
  return text.slice(start, end);
}

/**
 * ТОЧНЫЕ вхождения терминов (сильных) — как они реально написаны в строке.
 *
 * Нужно модели: если дать ей имя термина («оральный секс»), она сочиняет его
 * заново и в падеже именительного падежа — фрагмент потом не находится в
 * тексте, где стоит «оральным сексом» (поймано 2026-11-13, 4 попытки подряд).
 */
export function findOccurrences(text: string, lang: string): Array<{ name: string; text: string }> {
  const out: Array<{ name: string; text: string }> = [];
  for (const t of CLINICAL[lang] ?? []) {
    if (t.weak) continue;
    const m = new RegExp(t.re.source, t.re.flags.replace(/[gy]/gu, "")).exec(text);
    if (m) out.push({ name: t.name, text: widen(text, m, lang) });
  }
  return out;
}

/**
 * Дефект ли строка: сильная клиника всегда дефект; слабая — только если есть
 * сильная (иначе «клитор» в эротике — нормальное слово, а не медкарта).
 */
export function isClinical(text: string, lang: string): boolean {
  const { strong, weak } = findTerms(text, lang);
  return strong.length > 0 || weak.length > 1;
}

/** Теги Ren'Py (`{i}`, `[name]`) — их нельзя терять/дублировать при правке. */
const tags = (s: string): string[] => [...s.matchAll(/\{[^}]*\}|\[[^\]]*\]/gu)].map((m) => m[0]).sort();

/**
 * Слова с заглавной не в начале предложения: имена собственные. Теряются
 * чаще всего (модель меняет «к промежности Кейт» на «к её лоно»), поэтому
 * это гейт, а не пожелание.
 */
export function capitalNames(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/\p{Lu}[\p{L}'’-]{2,}/gu)) {
    // Слово в начале фразы пишется с заглавной по правилам орфографии — это не
    // имя. Проверка «потеряно имя» срабатывала на «Твоё», «Вот», «Кругообразными»
    // после перевода всей строки (найдено 2026-11-13 на родовом формате 9B).
    const before = s.slice(0, m.index ?? 0).trimEnd();
    if (before === "" || /[.!?…:—«("'„]$/u.test(before)) continue;
    const w = m[0];
    // Служебные слова с заглавной — тоже не имена.
    if (/^(Я|Он|Она|Они|Оно|Но|И|А|Его|Её|Их|Это|Тот|Та|То|Всё|Все|Однако|Потом|Затем)$/u.test(w)) continue;
    out.push(w);
  }
  return [...new Set(out)];
}

/**
 * Сохранилось ли имя с учётом склонения. «Сара» → «Сары/Саре/Сарой» — то же
 * имя, а «Сара» → «девушка» — потеря. Найдено 2026-11-13: гейт браковал
 * правильную правку «платье Сара́ …» → «платье Сары …».
 */
function nameKept(name: string, text: string): boolean {
  if (text.includes(name)) return true;
  const stem = name.toLowerCase().slice(0, Math.max(3, name.length - 2));
  for (const m of text.matchAll(/[\p{Lu}][\p{L}'’-]+/gu)) {
    const w = m[0].toLowerCase();
    if (w.startsWith(stem) && Math.abs(w.length - name.length) <= 2) return true;
  }
  return false;
}

/**
 * Механические гейты правки: пустой список = правку можно принимать
 * (смысл всё равно проверяет судья LLM).
 */
export function checkEdit(oldText: string, newText: string, lang: string): string[] {
  const errs: string[] = [];
  if (!newText.trim()) return ["пустая правка"];
  if (newText === oldText) return ["правка ничего не изменила"];
  const clin = findTerms(newText, lang).strong;
  if (clin.length) errs.push(`осталась клиника: ${clin.join(", ")}`);
  // Служебный мусор: только НОВЫЙ, которого в исходной строке не было.
  const oldLeaks = metaLeak(oldText);
  for (const l of metaLeak(newText)) if (!oldLeaks.includes(l)) errs.push(`мусор в тексте: ${l}`);
  if (/\s{2,}/u.test(newText) && !/\s{2,}/u.test(oldText)) errs.push("двойной пробел");
  if (/\n/u.test(newText) && !/\n/u.test(oldText)) errs.push("появился перенос строки");
  const oldTags = tags(oldText);
  const newTags = tags(newText);
  if (oldTags.join("|") !== newTags.join("|")) errs.push("изменились теги {…}/[…]");
  // Латиница в нелатинском языке: признак «модель вставила английское слово»
  // или сломанного токена.
  if (!/^(en|de|es|fr|it|pl|pt)$/u.test(lang)) {
    const latinOld = new Set(oldText.match(/[A-Za-z]{2,}/gu) ?? []);
    const latinNew = (newText.match(/[A-Za-z]{2,}/gu) ?? []).filter((w) => !latinOld.has(w));
    if (latinNew.length) errs.push(`латиница: ${latinNew.join(", ")}`);
  }
  // Имя может стоять в другом падеже («Сара́» → «Сары») — это не потеря.
  const lost = capitalNames(oldText).filter((n) => !nameKept(n, newText));
  if (lost.length) errs.push(`потеряно имя: ${lost.join(", ")}`);
  // Сломанные формы подстановки — только НОВЫЕ, которых в исходной строке не было.
  const oldShapes = shapeGates(oldText, lang);
  for (const s of shapeGates(newText, lang)) if (!oldShapes.includes(s)) errs.push(s);
  // Финальная пунктуация — часть авторского ритма: «…» вместо «.» уже порча.
  const fin = (s: string): string => (/[.!?…:;»"']\s*$/u.exec(s)?.[0] ?? "").trim();
  if (fin(oldText) !== fin(newText)) errs.push(`пунктуация в конце: «${fin(oldText)}» → «${fin(newText)}»`);
  return errs;
}
