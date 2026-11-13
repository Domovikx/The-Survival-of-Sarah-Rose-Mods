/**
 * tone_lexicon.test.mts — детектор клиники и гейты правки.
 * node --test .opencode/skills/translate/tone_lexicon.test.mts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  banTerms,
  capitalNames,
  checkEdit,
  findOccurrences,
  findTerms,
  isClinical,
  LEXICON_LANGS,
  metaLeak,
  nextDefect,
  registerMismatch,
  shapeGates,
} from "./tone_lexicon.mts";

test("детектор: пример владельца — медицинский регистр", () => {
  const line = "Теперь, когда её руки были связаны, а половые органы оставались открытыми.";
  assert.deepEqual(findTerms(line, "ru").strong, ["половые органы"]);
  assert.equal(isClinical(line, "ru"), true);
});

test("детектор: ложное срабатывание «останусь» (внутри «анус») не считается", () => {
  // Поймано 2026-11-13 на прогоне по корпусу: 220 кандидатов вместо 164.
  const line = "Я останусь здесь, даже если это будет означать риск для моей жизни.";
  assert.deepEqual(findTerms(line, "ru").strong, []);
  assert.equal(isClinical(line, "ru"), false);
});

test("детектор: формы слова ловятся (падежи, число)", () => {
  for (const line of [
    "его пенис коснулся её бедра",
    "два пальца во время полового акта",
    "остриё у самого заднего прохода",
    "после эякуляции",
  ]) {
    assert.equal(isClinical(line, "ru"), true, line);
  }
});

test("детектор: «клитор» сам по себе не дефект, но с сильной клиникой — повод", () => {
  assert.equal(isClinical("его язык нашёл её клитор", "ru"), false);
  assert.equal(isClinical("клитор и половые органы", "ru"), true);
});

test("детектор: влагалище/эрекция/промежность не запрещены (решение владельца 2026-11-13)", () => {
  // Слова нормальные для жанра: сами по себе не дефект и в запрет модели не идут.
  for (const line of [
    "во влагалище Сары",
    "он почувствовал эрекцию",
    "к промежности Кейт",
    "он довёл её до мастурбации",
  ]) {
    assert.equal(isClinical(line, "ru"), false, line);
  }
  const ban = banTerms("ru");
  for (const w of ["влагалище", "эрекция", "промежность", "мастурбация", "анус"]) assert.ok(!ban.includes(w), w);
  // А настоящая канцелярщина остаётся запретом.
  for (const w of ["половые органы", "пенис", "совокупление"]) assert.ok(ban.includes(w), w);
  // Скопление слабых всё равно читается как медкарта.
  assert.equal(isClinical("клитор и влагалище", "ru"), true);
});

test("детектор: чистые строки не трогаем", () => {
  for (const line of ["Её глаза соскользнули ниже — между ног Кейт.", "Он размахивал членом из стороны в сторону."]) {
    assert.equal(isClinical(line, "ru"), false, line);
  }
});

test("лексиконы есть у всех 10 языков каталога", () => {
  for (const lang of ["de", "es", "fr", "it", "ja", "ko", "pl", "pt", "ru", "zh"]) {
    assert.ok(LEXICON_LANGS.includes(lang), lang);
    assert.ok(findTerms("x", lang).strong.length === 0);
  }
});

test("детектор: другие языки узнают свои термины", () => {
  assert.deepEqual(findTerms("Er fuhr mit dem Finger in ihre Vagina.", "de").strong, ["Vagina"]);
  assert.deepEqual(findTerms("Le vagin de Sarah", "fr").strong, ["vagin"]);
  assert.deepEqual(findTerms("その性器は露出していた", "ja").strong, ["性器"]);
  assert.deepEqual(findTerms("그녀의 성기를 드러냈다", "ko").strong, ["성기"]);
  assert.deepEqual(findTerms("narządy płciowe były odsłonięte", "pl").strong, ["narządy płciowe"]);
});

test("детектор: польское «za odbyte» — не «odbyt»", () => {
  // Поймано 2026-11-13: «uznaj to za odbyte» давало ложного кандидата.
  assert.deepEqual(findTerms("uznaj to za odbyte", "pl").strong, []);
  assert.deepEqual(findTerms("jego palec w odbyt", "pl").strong, ["odbyt"]);
});

test("ложные срабатывания 2026-11-13: zh 逼/下身, pl chuj, ko 보지", () => {
  // «逼» — обычный глагол «вынуждать» (逼问/逼迫), а не мат.
  assert.deepEqual(registerMismatch("逼问他", "Pressure him.", "zh"), []);
  assert.deepEqual(registerMismatch("强迫自己入睡", "forcing herself asleep", "zh"), []);
  // «下身» = «низ тела», в том числе часть «俯下身» (наклониться).
  assert.deepEqual(registerMismatch("凯特俯下身", "Kate reached down.", "zh"), []);
  // «chuj» ловился внутри «wdmuchuje».
  assert.deepEqual(registerMismatch("za nim wdmuchuje się śnieg", "the snow drifting in behind him.", "pl"), []);
  // «보지 않으려는» — форма глагола «видеть», а не «пизда».
  assert.deepEqual(registerMismatch("아무것도 보지 않으려는 듯했다", "trying to look at nothing.", "ko"), []);
});

test("книжная лексика не огрубление: coño/figa/buceta", () => {
  assert.deepEqual(registerMismatch("dentro del coño de Sarah", "into Sarah's sex.", "es"), []);
  assert.deepEqual(registerMismatch("nella fica di Sarah", "into Sarah's sex.", "it"), []);
  assert.deepEqual(registerMismatch("na buceta de Sarah", "into Sarah's sex.", "pt"), []);
  // А клиника по-прежнему дефект.
  assert.deepEqual(findTerms("nella vagina di Sarah", "it").strong, ["vagina"]);
  assert.equal(isClinical("nella vagina di Sarah", "it"), true);
});

test("мастурбация — нормальное слово, не в запрете для модели", () => {
  // В меню EN «Masturbate» — «Masturbieren»/«自慰»/«자위» точный эквивалент.
  for (const lang of LEXICON_LANGS) {
    assert.ok(!banTerms(lang).some((t) => /masturb|自慰|자위/iu.test(t)), `${lang}: ${banTerms(lang)}`);
  }
  assert.equal(isClinical("Masturbieren", "de"), false);
});

test("findOccurrences: отдаёт точное написание термина, а не словарное имя", () => {
  // Модель получает «оральным сексом», иначе фрагмент не находится в строке.
  const hits = findOccurrences("поочерёдно занимаясь с ним оральным сексом", "ru");
  assert.deepEqual(
    hits.map((h) => h.text),
    ["оральным сексом"],
  );
  // Слабые термины вхождения не дают: их правят только за компанию с сильной клиникой.
  assert.deepEqual(findOccurrences("его язык нашёл её клитор", "ru"), []);
});

test("гейт: правка с остатком клиники не принимается", () => {
  const errs = checkEdit("а половые органы открыты", "а пенис открыт", "ru");
  assert.deepEqual(errs, ["осталась клиника: пенис"]);
});

test("гейт: потерянное имя не принимается", () => {
  const errs = checkEdit(
    "Её глаза соскользнули ниже — к промежности Кейт.",
    "Её глаза соскользнули ниже — к её лону.",
    "ru",
  );
  assert.ok(
    errs.some((e) => e.includes("потеряно имя: Кейт")),
    errs.join("; "),
  );
});

test("гейт: теги Ren'Py нельзя терять", () => {
  const errs = checkEdit("её {i}влагалище{/i} обнажено", "её лоно обнажено", "ru");
  assert.ok(
    errs.some((e) => e.includes("теги")),
    errs.join("; "),
  );
});

test("гейт: латиница в нелатинском языке — дефект", () => {
  const errs = checkEdit("её влагалище обнажено", "её sex обнажено", "ru");
  assert.ok(
    errs.some((e) => e.includes("латиница")),
    errs.join("; "),
  );
});

test("гейт: финальная пунктуация сохраняется", () => {
  const errs = checkEdit("а влагалище — обнажено.", "а её плоть — обнажена…", "ru");
  assert.ok(
    errs.some((e) => e.includes("пунктуация в конце")),
    errs.join("; "),
  );
});

test("гейт: чистая правка проходит", () => {
  const errs = checkEdit(
    "Теперь, когда её руки были связаны за спиной, казалось, будто она сама себя представляет: грудь выпирала вперёд, а половые органы оставались открытыми.",
    "Теперь, когда её руки были связаны за спиной, казалось, будто она сама себя представляет: грудь выпирала вперёд, а лоно оставалось открытым.",
    "ru",
  );
  assert.deepEqual(errs, []);
});

test("capitalNames: имена в середине строки, служебные слова — нет", () => {
  // Слово в начале фразы не считается именем (орфография, а не имя) — см. тест ниже.
  assert.deepEqual(capitalNames("Вчера Кейт сказала Саре: «Он ушёл»."), ["Кейт", "Саре"]);
  assert.deepEqual(capitalNames("Я останусь. Но потом."), []);
});

test("регистр: смягчение при грубом оригинале — дефект", () => {
  // Найдено в корпусе 2026-11-13: 6 строк «сучка» при EN «bitch» (книга говорит «сука»).
  assert.deepEqual(registerMismatch("Глупая сучка.", "Stupid bitch.", "ru"), ["сучка (мягче оригинала)"]);
  assert.deepEqual(registerMismatch("Он шлёпнул её по попке.", "He spanked her ass.", "ru"), [
    "попка (мягче оригинала)",
  ]);
});

test("регистр: «сучка» — смягчение для bitch, но прямое слово для slut", () => {
  // Найдено 2026-11-13: детектор считал дефектом «Slut.» -> «Сучка.».
  assert.deepEqual(registerMismatch("Сучка.", "Slut.", "ru"), []);
  assert.deepEqual(registerMismatch("Глупая сучка.", "Stupid bitch.", "ru"), ["сучка (мягче оригинала)"]);
});

test("регистр: нежное можно, если оригинал нежный", () => {
  // Принцип: система не «огрубляет всё подряд» — уровень берётся из EN.
  assert.deepEqual(registerMismatch("Он погладил её попку.", "He stroked her cute little bottom.", "ru"), []);
  assert.deepEqual(registerMismatch("Её ягодицы были обнажены.", "Her behind was bare.", "ru"), []);
});

test("регистр: огрубление при нейтральном оригинале — дефект", () => {
  assert.deepEqual(registerMismatch("Он вошёл ей в пизду.", "He pushed into her sex.", "ru"), [
    "пизда (грубее оригинала)",
  ]);
  // А при грубом EN та же лексика допустима (регистр задаёт автор).
  assert.deepEqual(registerMismatch("Он вошёл ей в пизду.", "He pushed into her cunt.", "ru"), []);
  // «киска» — словарь книги, а не огрубление.
  assert.deepEqual(registerMismatch("Он коснулся её киски.", "He touched her pussy.", "ru"), []);
});

test("nextDefect: клиника важнее регистровых оттенков", () => {
  assert.deepEqual(nextDefect("во время полового акта с Сарой", "during sex with Sarah", "ru")?.term, "полового акта");
  assert.deepEqual(nextDefect("Глупая сучка.", "Stupid bitch.", "ru")?.term, "сучка");
  assert.equal(nextDefect("Он коснулся её киски.", "He touched her pussy.", "ru"), null);
  // Слабое слово само по себе правку не заказывает.
  assert.equal(nextDefect("во влагалище Сары", "into Sarah's sex", "ru"), null);
});

test("гейт формы: замена слова ломает согласование и предложное управление", () => {
  // Реальные правки индекс-переводчика (2026-11-13), прошедшие его собственного судью.
  assert.deepEqual(shapeGates("Твоё киска ещё не готова, так что пока можешь просто использовать свой рот.", "ru"), [
    "согласование: «Твоё киска» — средний род при слове женского рода",
  ]);
  assert.deepEqual(shapeGates("Прижав губы к между ног Еулы, она почувствовала, как её тело содрогнулось.", "ru"), [
    "предлог стоит перед «между» без существительного («к между ног»)",
  ]);
  assert.deepEqual(shapeGates("Вот так её между ног оказались открыты ему.", "ru"), [
    "порядок слов: нужно «между её ног», а не «её между ног»",
  ]);
});

test("гейт формы: правильные строки не задевает", () => {
  assert.deepEqual(shapeGates("Твоя киска ещё не готова, так что пока можешь просто использовать свой рот.", "ru"), []);
  assert.deepEqual(shapeGates("Прижав губы к её животу, она почувствовала, как тело содрогнулось.", "ru"), []);
  assert.deepEqual(shapeGates("Твоё имя осталось в списке, а моё время ещё не пришло.", "ru"), []);
  assert.deepEqual(shapeGates("Она почувствовала его между её ног.", "ru"), []);
  assert.deepEqual(shapeGates("Твоё киска", "de"), [], "для других языков гейт не работает");
});

test("мусор в тексте: пометки модели («женский род») не должны попадать в перевод", () => {
  // Найдено 2026-11-13 в ru: 3 строки с вклеенным рассуждением.
  assert.deepEqual(metaLeak("У Самайры (женский род) заканчивалось время."), ["пометка о роде в скобках"]);
  assert.deepEqual(metaLeak("Гидеон был мужчиной (мужской род), а повествователь — женским персонажем."), [
    "пометка о роде в скобках",
    "пояснение про повествователя",
  ]);
  assert.deepEqual(metaLeak("EN: She walked in."), ["служебный префикс"]);
  assert.deepEqual(metaLeak("Она вошла и закрыла дверь."), []);
  // Легитимное «переводчик» (человек) и скобки в обычном тексте — не мусор.
  assert.deepEqual(metaLeak("Саре не нужен был переводчик для этого."), []);
  assert.deepEqual(metaLeak("Он пришёл (как всегда) поздно."), []);
});

test("гейт: склонение имени — не потеря", () => {
  // Найдено 2026-11-13: правильная правка «платье Сара́ (женский род)» →
  // «платье Сары» браковалась как «потеряно имя: Сара».
  assert.deepEqual(
    checkEdit(
      "Быстрым движением он перерезал лямки, и платье Сара́ (женский род) спало вниз.",
      "Быстрым движением он перерезал лямки, и платье Сары спало вниз.",
      "ru",
    ),
    [],
  );
  // А реальная потеря имени по-прежнему ловится.
  assert.ok(
    checkEdit("Её глаза соскользнули ниже — к промежности Кейт.", "Её глаза соскользнули ниже — к её лону.", "ru").some(
      (e) => e.includes("потеряно имя: Кейт"),
    ),
  );
});

test("capitalNames: первое слово фразы — не имя (баг перевода всей строки)", () => {
  // До 2026-11-13 гейт «потеряно имя» ложно срабатывал на «Твоё», «Вот»,
  // «Кругообразными»: они стоят в начале фразы и пишутся с заглавной.
  assert.deepEqual(capitalNames("Твоя киска пока не готова, так что можешь просто использовать рот."), []);
  assert.deepEqual(capitalNames("Вот так её киска была открыта ему."), []);
  // А настоящее имя в середине строки по-прежнему видно.
  assert.deepEqual(capitalNames("Кейт и Сара вошли в комнату, а Бельмонт ждал."), ["Сара", "Бельмонт"]);
});
