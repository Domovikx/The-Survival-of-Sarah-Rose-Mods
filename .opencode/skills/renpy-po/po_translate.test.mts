/**
 * po_translate.test.mts — юнит-тесты системы локальных переводов.
 * node --test .opencode/skills/renpy-po/po_translate.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  checkTranslation,
  ctlStatus,
  ctlStop,
  extractJson,
  foreignScriptIssue,
  isRunning,
  isSpeechCtx,
  isSymbolicMsgid,
  judgeSystem,
  judgeUser,
  medianOf,
  parseVerdict,
  VERIFY_ONE_SYSTEM,
  actionableJudgeIssues,
  fixExample,
  isNameLike,
  meaningfulIssues,
  parseArgs,
  salvageIssues,
  extractTranslation,
  stopRequested,
  systemPrompt,
  userPrompt,
  TMP_DIR,
} from "./po_translate.mts";
import { LANGS, langProfile } from "./po_langs.mts";
import type { PoEntry } from "./po_core.mts";

const mkEntry = (over: Partial<PoEntry> = {}): PoEntry => ({
  msgctxt: '"speaker:Narrator"',
  msgid: "She was tired but happy.",
  msgstr: "",
  refs: [],
  comments: ["emotion: Curiously observing"],
  flags: [],
  translator: [],
  ...over,
});

test("языковые профили: все 10 языков из списка владельца (NeonTranslator)", () => {
  assert.deepEqual(Object.keys(LANGS).sort(), ["de", "es", "fr", "it", "ja", "ko", "pl", "pt", "ru", "zh"]);
});

test("профили самодостаточны: правила, запреты, судья непустые", () => {
  for (const [code, p] of Object.entries(LANGS)) {
    assert.ok(p.rules.length > 500, `${code}: rules слишком короткие`);
    assert.ok(p.forbidden.length >= 3, `${code}: мало запретов`);
    assert.ok(p.judgeNotes.length > 50, `${code}: judgeNotes пустые`);
    // КРИТ-ФИКС 2026-10-24: полей lenMin/lenMax больше нет — длина не проверяется
    assert.ok(!("lenMin" in p) && !("lenMax" in p), `${code}: lenMin/lenMax должны быть выпилены`);
    assert.equal(p.code, code);
  }
});

test("неизвестный язык падает с понятной ошибкой", () => {
  assert.throws(() => langProfile("xx"), /Неизвестный язык/);
});

test("parseArgs: дефолты и переопределения", () => {
  const d = parseArgs(["--lang", "es"]);
  assert.equal(d.lang, "es");
  assert.equal(d.concurrency, 1);
  assert.equal(d.threshold, 9);
  assert.equal(d.judge, true);
  assert.equal(d.model, "qwen/qwen3.5-9b");
  const c = parseArgs(["--lang", "ja", "--limit", "5", "--no-judge", "--dry", "--concurrency", "3"]);
  assert.equal(c.limit, 5);
  assert.equal(c.judge, false);
  assert.equal(c.dry, true);
  assert.equal(c.concurrency, 3);
});

test("extractJson: чистый JSON, JSON в обрамлении, мусор", () => {
  assert.deepEqual(extractJson('{"es":"Hola"}'), { es: "Hola" });
  assert.deepEqual(extractJson('text {"es":"Hola"} tail'), { es: "Hola" });
  assert.deepEqual(extractJson('{"score":9,"issues":["a","b"]}'), { score: 9, issues: ["a", "b"] });
  assert.equal(extractJson("no json here"), null);
  assert.equal(extractJson('{"broken":'), null);
});

test("checkTranslation ловит: пустой, копию msgid, кавычки, плейсхолдеры; длина НЕ проверяется", () => {
  const e = mkEntry();
  assert.ok(checkTranslation(e, "", "es").includes("пустой перевод"));
  assert.ok(checkTranslation(e, e.msgid, "es").some((i) => i.includes("msgstr == msgid")));
  // КРИТ-ФИКС 2026-10-24: короткий перевод (×0.28) НЕ отклоняется по длине
  assert.ok(!checkTranslation(e, "Corto.", "es").some((i) => i.includes("длина")));
  assert.ok(checkTranslation(e, "«She was tired but happy.»", "es").some((i) => i.includes("кавычки")));
  const ph = mkEntry({ msgid: "Give %s to {i}her{/i}." });
  assert.ok(checkTranslation(ph, "Da %s a ella.", "es").some((i) => i.includes("плейсхолдер")));
  assert.ok(checkTranslation(ph, "Da %s a {i}ella{/i}.", "es").length === 0);
});

test("checkTranslation: es-запреты (клиника, латино-мины, род)", () => {
  const scene = mkEntry({ msgid: "He penetrated her deeply." });
  const bad = [
    ["Lo penetró profundamente.", "penetr"],
    ["Él la follar... coger", "coger"],
    ["Un mente ociosa.", "женского рода"],
  ];
  for (const [tr, why] of bad) {
    assert.ok(
      checkTranslation(scene, tr as string, "es").some((i) => i.includes(why)),
      `не поймали: ${tr}`,
    );
  }
  assert.equal(checkTranslation(scene, "Él se metió muy dentro de ella.", "es").length, 0);
});

test("checkTranslation: длина вообще не проверяется (крит-фикс 2026-10-24)", () => {
  const e = mkEntry();
  // Слишком короткий для старого ratio-лимита (×0.16) — теперь проходит
  assert.equal(checkTranslation(e, "Ok.", "es").length, 0);
  // Явно длиннее оригинала — тоже проходит
  assert.equal(checkTranslation(e, "Ella estaba muy cansada pero profundamente feliz.", "es").length, 0);
});

test("запреты всех языков: regex компилируются и ловят целевые слова", () => {
  const samples: Record<string, [string, string]> = {
    // lang: [текст, который ОБЯЗАН быть пойман]
    es: ["Lo penetró profundamente.", "penetr"],
    fr: ["Elle était fatigué aujourd'hui.", "женский"],
    it: ["Lui la penetrò con forza.", "penetrare"],
    pl: ["On penetrował ją mocno.", "penetrować"],
    pt: ["Ele penetrou fundo nela.", "penetrar"],
    ru: ["Она стонала: вагина горела.", "вагина"],
    de: ["Er drang in sie vor, vaginal.", "vaginal"],
    ja: ["膣の痛み.", "膣"],
    ko: ["질이 아팠다.", "질"],
    zh: ["阴道很疼。", "阴道"],
  };
  for (const [code, p] of Object.entries(LANGS)) {
    for (const [re] of p.forbidden) {
      assert.doesNotThrow(() => new RegExp(re, "iu"), `${code}: невалидный regex ${re}`);
    }
    const [sample, expect] = samples[code];
    const hits = checkTranslation(
      { msgctxt: '"speaker:Narrator"', msgid: sample, msgstr: "", refs: [], comments: [], flags: [], translator: [] },
      sample,
      code,
    );
    // msgstr==msgid тоже сработает — важно, что целевой паттерн НЕ пропущен:
    assert.ok(
      hits.some((i) => i.includes(expect)),
      `${code}: не поймано "${expect}" в "${sample}": ${hits.join("; ")}`,
    );
  }
});

test("кириллица/акценты: \b не работает — паттерны обязаны ловить всё же", () => {
  const e = mkEntry({ msgid: "He penetrated her deeply." });
  for (const [tr, why] of [
    ["Он вагинально... вагина.", "вагина"],
    ["Lo penetró profundamente.", "penetr"],
    ["Lui la penetrò.", "penetrare"],
    ["On penetrował.", "penetrować"],
    ["Elle était fatigué.", "женский"],
  ] as Array<[string, string]>) {
    const lang =
      why === "вагина"
        ? "ru"
        : why === "penetr"
          ? "es"
          : why === "penetrare"
            ? "it"
            : why === "penetrować"
              ? "pl"
              : "fr";
    void e;
    const res = checkTranslation(
      {
        msgctxt: '"speaker:Narrator"',
        msgid: "He penetrated her deeply.",
        msgstr: "",
        refs: [],
        comments: [],
        flags: [],
        translator: [],
      },
      tr,
      lang,
    );
    assert.ok(
      res.some((i) => i.includes(why)),
      `${lang}: не поймано (${tr}) — ждали "${why}", есть: ${res.join("; ")}`,
    );
  }
});

test("systemPrompt: правила языка и few-shot на месте", () => {
  const es = systemPrompt("es");
  assert.match(es, /tú/);
  assert.match(es, /STYLE EXAMPLES/);
  assert.match(es, /strict JSON/i);
  const de = systemPrompt("de");
  assert.match(de, /Address form/);
  assert.ok(!de.includes("vosotros"), "de не должен тащить es-правила");
});

test("userPrompt: тон из POT (обратный резолв), спикер, контекст и фидбэк", () => {
  const e = mkEntry({ msgctxt: '"speaker:Sarah"' });
  const up = userPrompt(
    e,
    ["Narrator prev"],
    ["Narrator next"],
    "Your previous answer was rejected: X.",
    "Eagerly excited",
  );
  assert.match(up, /emotion: Eagerly excited/);
  assert.match(up, /speaker: "speaker:Sarah"/);
  assert.match(up, /CONTEXT \(previous lines\)/);
  assert.match(up, /CONTEXT \(following lines\)/);
  assert.match(up, /previous answer was rejected/);
  assert.ok(!up.includes("emotion:" + "Eagerly excited".repeat(2)));
});

test("userPrompt: тон null (строки нет в POT) — дефолт, без контекста — без блоков", () => {
  const e = mkEntry({ comments: [] });
  const up = userPrompt(e, [], [], "", null);
  assert.match(up, /emotion: Curiously observing/);
  assert.ok(!up.includes("CONTEXT"));
});

test("ctl-механизм: stopRequested / isRunning / ctlStop — флаги и pid-файлы", () => {
  // язык-заглушка: ctl-функции работают с любым кодом (в тестах не парсим po)
  const lang = "testctl";
  const stopFile = join(TMP_DIR, `po_translate_${lang}.stop`);
  const pidFile = join(TMP_DIR, `po_translate_${lang}.pid`);
  rmSync(stopFile, { force: true });
  rmSync(pidFile, { force: true });
  try {
    // без pid-файла: не идёт, флаг не нужен
    assert.equal(isRunning(lang), false);
    assert.equal(stopRequested(lang), false);
    // ctlStop без прогона: не ставит флаг
    ctlStop([lang]);
    assert.equal(stopRequested(lang), false);
    // живой pid (наш собственный процесс) => running
    writeFileSync(pidFile, String(process.pid), "utf-8");
    assert.equal(isRunning(lang), true);
    // ctlStop при живом прогоне: ставит флаг
    ctlStop([lang]);
    assert.equal(stopRequested(lang), true);
    // мёртвый pid: не running, висячий флаг снимается
    writeFileSync(pidFile, "999999999", "utf-8");
    assert.equal(isRunning(lang), false);
    ctlStop([lang]);
    assert.equal(stopRequested(lang), false);
    // битый pid-файл: не running (защита от мусора)
    writeFileSync(pidFile, "не-число", "utf-8");
    assert.equal(isRunning(lang), false);
    // ctlStatus не падает без po-файла языка-заглушки
    ctlStatus([lang]);
  } finally {
    rmSync(stopFile, { force: true });
    rmSync(pidFile, { force: true });
  }
});

// ---------- UI-ветка и фильтры (задача 2026-10-25-demo-e2e) ----------

test("isSpeechCtx: speaker:* — речь; menu/ui/speaker-name — интерфейс", () => {
  assert.equal(isSpeechCtx('"speaker:Sarah"'), true);
  assert.equal(isSpeechCtx('"speaker:Narrator"'), true);
  assert.equal(isSpeechCtx('"menu"'), false);
  assert.equal(isSpeechCtx('"ui"'), false);
  assert.equal(isSpeechCtx('"speaker-name"'), false); // "speaker-name" без двоеточия — не речь
});

test("UI-ветка userPrompt: без выдуманной эмоции и speaker для menu/ui", () => {
  const menu = mkEntry({ msgctxt: '"menu"', msgid: "Accept Belmont's offer." });
  const up = userPrompt(menu, [], [], "", null);
  assert.ok(!up.includes("Curiously observing"), "эмоция диктора не должна подставляться");
  assert.ok(!up.includes("speaker:"), "speaker: menu — бессмысленно");
  assert.match(up, /interface string/i);
  assert.match(up, /Accept Belmont's offer\./);
  // речь ведёт себя как раньше
  const speech = userPrompt(mkEntry(), [], [], "", null);
  assert.match(speech, /emotion: Curiously observing/);
  assert.match(speech, /speaker: "speaker:Narrator"/);
});

test("judgeSystem: UI — без эрогенных правил и с запретом штрафовать длину", () => {
  const ui = judgeSystem('"menu"');
  assert.match(ui, /NEVER penalize translation length/);
  // «erotic-prose» встречается только в запрете; сам эрогенный register-блок — только у речи
  assert.ok(!ui.includes("frank erotic prose"), "эрогенный register-блок не должен попадать в UI-судью");
  assert.match(ui, /interface string/i);
  const speech = judgeSystem('"speaker:Sarah"');
  assert.match(speech, /frank erotic prose/); // речь остаётся со старыми правилами
  assert.ok(!speech.includes("interface string"));
});

test("parseArgs: --ctxt и --arc", () => {
  const o = parseArgs(["--lang", "de", "--ctxt", "menu,ui", "--arc", "Prologue"]);
  assert.equal(o.ctxt, "menu,ui");
  assert.equal(o.arc, "Prologue");
  assert.equal(parseArgs(["--lang", "de"]).ctxt, "");
  assert.equal(parseArgs(["--lang", "de"]).arc, "");
});

// ---------- бага символьных msgid + классовые авточеки (2026-10-25) ----------

test("isSymbolicMsgid: символы/многоточие — да; текст с буквами — нет", () => {
  for (const s of ["<", ">", "...", "…", "«»", "-", "%"]) {
    assert.equal(isSymbolicMsgid(s), true, `ожидали символьный: ${s}`);
  }
  for (const s of ["Load", "Sarah...", "Ctrl + A", "Трахай", "很累", "こんにちは", "Загрузка"]) {
    assert.equal(isSymbolicMsgid(s), false, `ожидали текстовый: ${s}`);
  }
});

test("checkTranslation: символьный msgid — только идентичность (шлюз баги)", () => {
  const lt = mkEntry({ msgctxt: '"ui"', msgid: "<" });
  // галлюцинация из контекста — rejected
  assert.ok(
    checkTranslation(lt, "<A Brief Investigation on Ethics>", "pl").some((i) => i.includes("символьный")),
    "галлюцинация должна быть поймана",
  );
  assert.ok(checkTranslation(lt, "< ui >", "de").some((i) => i.includes("символьный")));
  assert.ok(checkTranslation(lt, "《伦理学简史》作者：路凡", "zh").some((i) => i.includes("символьный")));
  // идентичность — чисто (в т.ч. для `>` «msgstr == msgid» НЕ ругается)
  assert.deepEqual(checkTranslation(lt, "<", "pl"), []);
  const gt = mkEntry({ msgctxt: '"ui"', msgid: ">" });
  assert.deepEqual(checkTranslation(gt, ">", "es"), []);
  // пустой перевод символьного — тоже ошибка (шлюз обязан заполнить идентичностью)
  assert.ok(checkTranslation(lt, "", "fr").some((i) => i.includes("символьный")));
});

test("foreignScriptIssue: чужая письменность ловится, своя — нет", () => {
  // латинские языки: кириллица/CJK/греческий — мусор
  assert.ok(foreignScriptIssue("pl", "Томас")?.includes("кириллица"));
  assert.ok(foreignScriptIssue("es", "se retuercе")?.includes("кириллица")); // кириллическая «е»
  assert.ok(foreignScriptIssue("de", "《伦理学简史》")?.includes("CJK"));
  assert.equal(foreignScriptIssue("es", "Se retuerce y gira."), null);
  assert.equal(foreignScriptIssue("fr", "Él la pecó sin fin — ó, ¡ay!"), null); // акценты — не мусор
  // ru: кириллица своя, CJK/греческий — чужие
  assert.equal(foreignScriptIssue("ru", "Она устала, но счастлива."), null);
  assert.ok(foreignScriptIssue("ru", "她很累")?.includes("CJK"));
  // CJK-языки: кириллица/греческий — чужие
  assert.ok(foreignScriptIssue("ja", "Томас")?.includes("кириллица"));
  assert.equal(foreignScriptIssue("zh", "她很累。"), null);
  assert.equal(foreignScriptIssue("ko", "그녀는 피곤하다."), null);
});

test("ЗАПРЕТ длины как критерия (приказ владельца 2026-10-26): любой размер проходит", () => {
  // Раньше это была проверка класса D («короткий msgid → длинный перевод»).
  // ЗАПРЕЩЕНО: сверка делается только LLM-ревьюером по смыслу/семантике.
  const btn = mkEntry({ msgctxt: '"ui"', msgid: "Load" });
  const longTr = "Carga la mercancía, trabaja en el barco, haz lo que necesites.".repeat(3);
  assert.ok(
    !checkTranslation(btn, longTr, "es").some((i) => i.includes("длин")),
    "длина НЕ должна фигурировать в замечаниях",
  );
  // и никакого ratio: сверхдлинный перевод короткой кнопки — тоже молча
  const kbd = mkEntry({ msgctxt: '"ui"', msgid: "Tab" });
  assert.ok(!checkTranslation(kbd, "Табуляция".repeat(40), "ru").some((i) => i.includes("длин")));
  // сверхкороткий перевод длинного текста — не ошибка по длине
  const long = mkEntry({ msgid: "She was tired but happy after everything that happened that day." });
  assert.equal(
    checkTranslation(long, "Ok.", "es").some((i) => i.includes("длин")),
    false,
  );
  // а вот смысл/письменность/плейсхолдеры проверяются по-прежнему
  assert.ok(checkTranslation(btn, "Загрузить", "es").some((i) => i.includes("чужая письменность")));
});

test("checkTranslation: новые классовые проверки не бьют по норме", () => {
  const e = mkEntry({ msgid: "She was tired but happy." });
  assert.equal(checkTranslation(e, "Ella estaba cansada pero feliz.", "es").length, 0);
  assert.equal(checkTranslation(e, "Elle était fatiguée mais heureuse.", "fr").length, 0);
});

// ---------- бага 2026-10-25, раунд 2: чужой язык в латинице + легальная идентичность ----------

test("чужой язык внутри латиницы ловится авточеками (it/pl/pt)", () => {
  // испанский в итальянском (реальные кейсы it.po)
  const itE = mkEntry({ msgctxt: '"speaker:Narrator"', msgid: "Finally, home again." });
  assert.ok(
    checkTranslation(itE, "Finalmente, en casa otra vez.", "it").some((i) => i.includes("испанск")),
    "испанский в it должен быть пойман",
  );
  assert.ok(checkTranslation(itE, "¡Voy!", "it").some((i) => i.includes("испанск")));
  assert.ok(checkTranslation(itE, "Te he extrañado tanto, padre!", "it").some((i) => i.includes("испанск")));
  assert.equal(checkTranslation(itE, "Di nuovo a casa.", "it").length, 0, "нормальный итальянский проходит");
  // немецкий в польском (реальный кейс pl [39298])
  const plE = mkEntry({ msgctxt: '"speaker:Narrator"', msgid: "Sarah knows that Atilla is right." });
  assert.ok(
    checkTranslation(plE, "Sarah weiß, dass Atilla recht hat.", "pl").some((i) => i.includes("немецк")),
    "немецкий в pl должен быть пойман",
  );
  // испанский в португальском (реальные кейсы pt)
  const ptE = mkEntry({ msgctxt: '"speaker:Narrator"', msgid: "I've missed you so much dad!" });
  assert.ok(checkTranslation(ptE, "Te extrañé tanto, papá!", "pt").some((i) => i.includes("испанск")));
  assert.ok(checkTranslation(ptE, "No le des nada.", "pt").some((i) => i.includes("испанск")));
  // в САМОМ es испанский — норма
  assert.deepEqual(checkTranslation(itE, "Finalmente, en casa otra vez.", "es"), []);
});

test("легальная идентичность: имена спикеров и короткие клавиши не отклоняются", () => {
  const name = mkEntry({ msgctxt: "speaker-name", msgid: "Thomas" });
  assert.deepEqual(checkTranslation(name, "Thomas", "pl"), [], "имя спикера = идентичность — ОК");
  const key = mkEntry({ msgctxt: "ui", msgid: "Ctrl" });
  assert.deepEqual(checkTranslation(key, "Ctrl", "ru"), [], "клавиша = идентичность — ОК");
  const btn = mkEntry({ msgctxt: '"menu"', msgid: "Auto" });
  assert.deepEqual(checkTranslation(btn, "Auto", "de"), [], "короткая UI-кнопка — ОК");
  // длинная UI-строка: идентичность всё ещё бага
  const long = mkEntry({ msgctxt: '"ui"', msgid: "A very long settings label here" });
  assert.ok(checkTranslation(long, "A very long settings label here", "it").some((i) => i.includes("msgstr == msgid")));
  // речь: идентичность по-прежнему rejected
  const speech = mkEntry();
  assert.ok(checkTranslation(speech, speech.msgid, "es").some((i) => i.includes("msgstr == msgid")));
});

test("судья: LANGUAGE GATE первым пунктом (чужой язык = 0-2 балла)", () => {
  const speech = judgeUser("it", mkEntry({ msgctxt: '"speaker:Narrator"' }), "Finalmente a casa.", "Calmly");
  assert.match(speech, /LANGUAGE GATE \(highest priority\)/);
  assert.match(speech, /Italiano \(it\)/);
  // Новая структура (фикс ложной утечки 2026-10-26): источник — отдельная
  // секция, кандидат — за ней, горт — СРАЗУ ПОСЛЕ кандидата.
  const src = speech.indexOf("SOURCE (always English");
  const cand = speech.indexOf("CANDIDATE (ONLY this text");
  const gate = speech.indexOf("LANGUAGE GATE");
  assert.ok(src > 0 && cand > src, "секция источника должна идти ДО кандидата");
  assert.ok(gate > cand, "гейт должен стоять ПОСЛЕ кандидата (ближе к судимому)");
  assert.match(speech, /it is NOT the candidate and can never be a language leak/);
  const ui = judgeUser("pl", mkEntry({ msgctxt: '"ui"', msgid: "Keyboard" }), "Klawiatura", null);
  assert.match(ui, /Polski \(pl\)/);
  assert.ok(!ui.includes("emotion:"), "UI-гейт без эмоции");
});

test("реплика-имя «Thomas...» не отбраковывается как «не переведено» (инцидент 2026-10-26)", () => {
  // Было: 6 языков вечно зависали на реплике-имени — авточек сравнивал
  // msgstr с msgid и не знал, что переводить нечего, судья не вызывалась.
  const name = mkEntry({ msgctxt: '"speaker:Sarah"', msgid: "Thomas..." });
  assert.ok(
    !checkTranslation(name, "Thomas...", "de").some((i) => i.includes("не переведено")),
    "имя с многоточием должно проходить авточек и уходить судье",
  );
  // а английское предложение из нескольких слов по-прежнему подозрительно
  const sent = mkEntry({ msgctxt: '"speaker:Sarah"', msgid: "She goes home." });
  assert.ok(
    checkTranslation(sent, "She goes home.", "de").some((i) => i.includes("не переведено")),
    "полное предложение копипастом — не принимаем",
  );
});

test("pl: польское «ich» не считается немецким (коллизия стоп-листа 2026-10-26)", () => {
  // `ich` = род. мн. «их» (ich matki, ich kroki) — законное польское слово.
  // Старый стоп-лист вешал 5 валидных переводов автома́тикой (judge=-1).
  const e = mkEntry({ msgctxt: '"speaker:Narrator"', msgid: "Their steps echoed softly in the hall." });
  assert.deepEqual(
    checkTranslation(e, "Ich kroki cicho echem odbijały się od ścian pałacu.", "pl"),
    [],
    "польское «Ich» не должно ругаться",
  );
  // а настоящий немецкий ловится (в списке остались nicht/das/wir/...)
  assert.ok(
    checkTranslation(e, "Das ist nicht gut, wir gehen jetzt sofort.", "pl").some((i) => i.includes("немецкий")),
    "немецкий обязан ловиться",
  );
});

test("userPrompt: имя персонажа НЕ подаётся как «переведи как UI» (фикс 2026-10-26)", () => {
  // Раньше speaker-name получал «translate as concise UI copy» — модель
  // переводила имена в бред (Hugh -> «abbracciare insieme per scaldarsi»),
  // судья отклоняла, строка висела (5 штук).
  const name = mkEntry({ msgctxt: '"speaker-name"', msgid: "Hugh" });
  const up = userPrompt(name, [], [], "", null);
  assert.match(up, /CHARACTER NAME/);
  assert.match(up, /Do NOT translate it/);
  assert.ok(!up.includes("translate as concise UI copy"), "для имени не должно быть команды переводить");

  // а menu/ui по-прежнему переводятся как интерфейс (и короткие — тоже)
  const ui = mkEntry({ msgctxt: '"ui"', msgid: "Transitions" });
  const upUi = userPrompt(ui, [], [], "", null);
  assert.match(upUi, /concise UI copy/);
  assert.match(upUi, /do NOT keep the English/, "короткие надписи обязаны переводиться");
});

test("клинические запреты не действуют на menu/ui (инцидент ko «인질» 2026-10-26)", () => {
  // Паттерн ko «질(?!...)» не имеет границ: внутри слова «인질» (= hostage)
  // он матчился как «клинический», и меню «Keep them as our hostages» вечно
  // отбраковывалось. COMMON говорит «FORBIDDEN in scenes» — значит клинике
  // место только в диалоге/наррации.
  const menu = mkEntry({ msgctxt: '"menu"', msgid: "Keep them as our hostages." });
  assert.deepEqual(
    checkTranslation(menu, "그들을 우리 인질로 남겨 둔다.", "ko"),
    [],
    "меню не должно ловиться на клинике",
  );

  // а в сцене клинический запрет обязан работать
  const scene = mkEntry({ msgctxt: '"speaker:Narrator"', msgid: "He pressed into her." });
  assert.ok(
    checkTranslation(scene, "그가 그녀의 질 안으로 밀어 넣었다.", "ko").some((i) => i.includes("клинический")),
    "в сцене клинический паттерн обязан срабатывать",
  );
});

test("плейсхолдеры: {#...} теги Ren'Py ловятся (бага E2E 2026-10-26)", () => {
  // Раньше regex требовал букву сразу после "{", поэтому {#file_time}
  // не считался плейсхолдером и ПРИНИМАЛСЯ перевод, выкинувший его.
  const e = mkEntry({ msgctxt: '"ui"', msgid: "{#file_time}%A, %B %d %Y, %H:%M" });
  assert.ok(checkTranslation(e, "%A, %B %d %Y, %H:%M", "ja").some((i) => i.includes("плейсхолдер")));
  assert.ok(
    !checkTranslation(e, "{#file_time}%A, %B %d %Y, %H:%M", "ja").some((i) => i.includes("плейсхолдер")),
    "целый {#...} не должен считаться потерянным",
  );
  // классика: %s и {i}...{/i} работают как раньше
  const p2 = mkEntry({ msgid: "Give %s to {i}her{/i}" });
  assert.ok(checkTranslation(p2, "Дай %s ей", "ru").some((i) => i.includes("плейсхолдер")));
});

test("extractTranslation: нейтральный ключ tr (фикс утечки испанскоГО)", () => {
  assert.equal(extractTranslation({ tr: "Hallo Welt" }, "de"), "Hallo Welt");
  // запасные пути: код языка, легаси "es"
  assert.equal(extractTranslation({ de: "Guten Tag" }, "de"), "Guten Tag");
  assert.equal(extractTranslation({ es: "Hola" }, "fr"), "Hola");
  // приоритет tr выше остальных
  assert.equal(extractTranslation({ es: "Hola", tr: "Hallo" }, "de"), "Hallo");
  // единственная строка в объекте — принимаем как отчаянный фолбэк
  assert.equal(extractTranslation({ any: "Bonjour" }, "fr"), "Bonjour");
  // две строки и ноль строк — не гадаем
  assert.equal(extractTranslation({ a: "x", b: "y" }, "fr"), "");
  assert.equal(extractTranslation(null, "fr"), "");
  assert.equal(extractTranslation({ tr: "   " }, "fr"), "");
});

test("salvageIssues: диагностика вытаскивается из битого JSON судьи", () => {
  // раньше при обрыве JSON причина терялась («битый JSON — issues потеряны»),
  // таких отказов накопилось 830
  const broken = '{"score": 7, "issues": ["wrong language: Spanish found", "adjective ending bad"], "note": "о';
  assert.deepEqual(salvageIssues(broken), ["wrong language: Spanish found", "adjective ending bad"]);
  // issues с одним элементом и без него
  assert.deepEqual(salvageIssues('{"score": 3, "issues": ["grammar"]}'), ["grammar"]);
  assert.deepEqual(salvageIssues('{"score": 10}'), []);
  // разэкранирование кавычек внутри строки
  assert.deepEqual(salvageIssues('{"issues": ["he said \\"hi\\" badly"]}'), ['he said "hi" badly']);
});

test("systemPrompt: языковой блок первым + ключ tr + few-shot", () => {
  const de = systemPrompt("de");
  // OUTPUT LANGUAGE должен идти ДО любых прочих правил
  assert.ok(de.startsWith("OUTPUT LANGUAGE: Deutsch (de)"), "языковой блок — первая строка");
  assert.ok(de.indexOf("OUTPUT LANGUAGE") < de.indexOf("HARD RULES"));
  assert.match(de, /"tr":"<translation>"/);
  assert.ok(!/"es":"<translation>"/.test(de), "старого ключа es в правилах быть не должно");
  // few-shot подписан целевым языком, а не абстрактным TARGET
  assert.match(de, /STYLE EXAMPLES \(EN -> Deutsch/);
  assert.match(de, /\n   DE: /);
  // для CJK — своя подпись
  assert.match(systemPrompt("ja"), /STYLE EXAMPLES \(EN -> 日本語/);
  assert.match(systemPrompt("ja"), /\n   JA: /);
});

test("systemPrompt: OUTPUT LANGUAGE есть у ВСЕХ 10 языков (анти-утечка)", () => {
  for (const code of Object.keys(LANGS)) {
    const p = systemPrompt(code);
    assert.ok(p.startsWith("OUTPUT LANGUAGE:"), `${code}: блока языка нет`);
    assert.match(p, /"tr"/, `${code}: нет нейтрального ключа`);
    assert.ok(p.length > 1500, `${code}: промпт подозрительно короткий (${p.length})`);
  }
});

test("судья получает ТУ ЖЕ языковую специфику, что и модель (фикс 2026-10-26)", () => {
  // JUDGE_SYSTEM требует «lexicon in the task rules is MANDATORY», но судье
  // раньше уходило только одно предложение judgeNotes — она досочивала по
  // памяти и противоречила себе («semen -> cum» против «esperma -> semen»).
  const speech = judgeUser("es", mkEntry({ msgctxt: '"speaker:Narrator"' }), "Vino dentro de ella.", null);
  assert.match(speech, /Lexicon/, "судья должна видеть таблицу лексикона");
  assert.match(speech, /FORBIDDEN in scenes/, "судья должна видеть запрет клиники в сценах");
  assert.match(speech, /coño/, "судья должна видеть конкретные варианты лексикона");
  // COMMON (правило вывода {"tr"...}) судье НЕ отдаём — конфликтовало бы
  // с её собственным {"score": ...}
  assert.ok(!speech.includes('"tr":"<translation>"'), "правила вывода модели судье не нужны");

  // а UI-судья сценарных правил НЕ получает — это было и раньше, но фиксируем
  const ui = judgeUser("es", mkEntry({ msgctxt: '"ui"', msgid: "Save" }), "Guardar", null);
  assert.ok(!ui.includes("FORBIDDEN in scenes"), "UI-судье не подмешиваем правила сцен");
});

test("meaningfulIssues: мусорный фидбэк отбрасывается, настоящий остаётся", () => {
  // Мусор из судьи (инцидент 2026-10-26): обрывки занимали слот slice(0,3)
  // и вытесняли реальные замечания.
  const junk = ["luz", ",", "Semilla", "Я", "Monte", "montaña de placer"];
  assert.deepEqual(meaningfulIssues(junk), [], "обрывки не должны уходить модели");

  const real = [
    "Gender agreement: 'Culta' matches Sarah",
    "Fidelity: 'follábamos' contradicts source 'had never taken her'",
    "use 'carpa' instead of neutral 'tienda'",
  ];
  assert.deepEqual(meaningfulIssues(real), real, "осмысленный фидбэк сохраняется");

  // мусор отбрасывается, порядок настоящих сохраняется
  const mixed = ["luz", "Gender agreement: 'Culta' matches Sarah", ",", "use 'carpa' instead of 'tienda'"];
  assert.deepEqual(meaningfulIssues(mixed), [
    "Gender agreement: 'Culta' matches Sarah",
    "use 'carpa' instead of 'tienda'",
  ]);
});

test("авточек отдаёт ИСПОЛНИМЫЙ фидбэк: слово-нарушитель + что сделать (фикс 2026-10-26)", () => {
  // Сообщения вида «форма España» / «клинический penetrar» — метки для
  // отчёта; внутри английского промпта модель не понимала, что править,
  // и тратила 8 попыток впустую. Теперь к метке прикладывается сам
  // нарушитель и указание его убрать.
  const scene = mkEntry({ msgctxt: '"speaker:Narrator"' });
  const v = checkTranslation(scene, "liberar a cada uno de vosotros", "es");
  const form = v.find((i) => i.includes("форма España"));
  assert.ok(form, "форма обращения должна пойматься");
  assert.match(form!, /vosotros/, "нужно назвать слово-нарушитель");
  assert.match(form!, /MANDATORY EDIT: replace EVERY occurrence of "vosotros" with "ustedes"/, "нужна явная замена");
  assert.ok(!form!.includes("RULE:"), "при известной замене RULE-подсказку не даём (она повторяет запрет)");

  const c = checkTranslation(scene, "al sentir su penetración repentina.", "es");
  const clin = c.find((i) => i.includes("клинический"));
  assert.ok(clin, "клиника должна пойматься");
  assert.match(clin!, /penetración/, "нужно назвать слово-нарушитель");

  // копия msgid — тоже с инструкцией, а не голой меткой
  const copy = checkTranslation(
    mkEntry({ msgctxt: '"speaker:Narrator"', msgid: "Kneeling down behind her, he entered her again." }),
    "Kneeling down behind her, he entered her again.",
    "es",
  );
  assert.ok(
    copy.some((i) => i.includes("verbatim copy of the source") && i.includes("translate the sentence")),
    "копия msgid должна получить исполнимое указание",
  );

  // а междометный копия («No, no, no.») — легитимна: отличается только
  // знаками, вердикт даёт судья, а не арифметика (инцидент 2026-10-26)
  assert.deepEqual(
    checkTranslation(mkEntry({ msgctxt: '"speaker:Narrator"', msgid: "No, no, no." }), "No, no, no.", "es"),
    [],
    "междометия-копия не должна отбраковываться",
  );
});

test("isNameLike: имена и перечисления проходят, английские предложения — нет", () => {
  // «Edmond. Antonio.» — перечисление имён: переводить нечего, но раньше
  // авточек вешал «не переведено» и строка висела (инцидент 2026-10-26).
  for (const ok of ["Thomas...", "Alaric.", "Ah...", "Edmond. Antonio.", "Sarah! Thomas!"]) {
    assert.ok(isNameLike(ok), `должно пройти: ${ok}`);
  }
  for (const no of ["Dutifully, Sarah did.", "No, no, no.", "Kneeling down behind her, he entered her again."]) {
    assert.ok(!isNameLike(no), `должно быть отклонено: ${no}`);
  }
});

test("fixExample: пример замены строится по КОНТЕКСТУ строки (фикс 2026-10-26)", () => {
  // Живой A/B (9 прогонов): абстрактный «replace vosotros with ustedes»
  // модель игнорировала (0/9), тот же текст со СВОИМ контекстом строки
  // чинил 9/9 — ей нужен готовый образец правки.
  const src = "Como es tradición, coronaré entre vosotros a uno más Exaltado.";
  const ex = fixExample(src, "vosotros", "ustedes");
  assert.match(ex, /entre vosotros a/, "пример должен брать слова слева/справа");
  assert.match(ex, /->/, "нужна стрелка замены");
  assert.ok(!ex.includes("a uno") || ex.includes("a uno"), "контекст сохраняется");
  const dst = ex.match(/-> "(.+)"/)![1];
  assert.ok(!dst.includes("vosotros"), "в замене не должно остаться запрещённого слова");
  assert.ok(dst.includes("ustedes"), "в замене должна быть правильная форма");
  assert.equal(dst, "entre ustedes a", "пример = тот же контекст с заменой слова");

  // нарушитель в начале строки — левого слова нет, пример всё равно собирается
  assert.match(fixExample("Vosotros sois los elegidos", "Vosotros", "Ustedes"), /Vosotros sois/);
  // слово не найдено — примера нет (не выдумываем контекст)
  assert.equal(fixExample("sin esa forma", "vosotros", "ustedes"), "");
});

test("судья: запрет требовать FORBIDDEN-слово и взаимоисключающие синонимы (фикс 2026-10-26)", () => {
  const sys = judgeSystem('"speaker:Narrator"');
  // инцидент: судья требовала «penetración», которую правила запрещают,
  // и по очереди запрещала «leche»/«semen»/«semilla» — все из таблицы
  assert.match(sys, /NEVER ask for a term the rules mark FORBIDDEN/, "нет запрета требовать запрещённое");
  assert.match(sys, /Lexicon line lists ALL acceptable equivalents/, "нет правила про синонимы");
  assert.match(sys, /never call a listed synonym wrong/, "нет запрета ругать разрешённый синоним");
  // инцидент остатка es: судья выдумывала запреты («clítoris запрещён»,
  // «entrada клинический») и носила вкусовщину («leche -> semilla»)
  assert.match(sys, /NO TASTE-MAKING/, "нет запрета на вкусовщину");
  assert.match(sys, /A word NOT listed as forbidden is ALLOWED/, "нет запрета выдумывать запреты");
  assert.match(sys, /score 9-10 and output \[\]/, "нет инструкции ставить 9-10 без дефектов");
  assert.match(sys, /quote the exact wrong fragment and state the exact fix/, "нет требования исполнимости замечания");
});

test("actionableJudgeIssues: замечание с FORBIDDEN-термином отбрасывается (фикс 2026-10-26)", () => {
  // Инцидент: судья писала «usar "penetración"» / «usar "infiltró"» —
  // термины из FORBIDDEN-списка. Модель выполняла запрет авточека, судья
  // veto'ила исправление -> неразрешимая петля на 8 попыток.
  const demandsForbidden = [
    '"entrada en ella" es eufemismo clínico; usar "penetración" según lexicon.',
    'The clinical term "penetrado" must be replaced by the explicit lexicon.',
  ];
  assert.deepEqual(actionableJudgeIssues(demandsForbidden, "es"), [], "предложения нарушить правила отбрасываются");

  const real = [
    "Gender agreement: 'sufrió' must agree with the feminine subject",
    "Fidelity: 'su marido' adds information not present in the source",
  ];
  assert.deepEqual(actionableJudgeIssues(real, "es"), real, "настоящие дефекты проходят");

  // мусор по-прежнему отбрасывается, порядок сохраняется
  const mixed = ["dissapeared", real[0], ",", real[1]];
  assert.deepEqual(actionableJudgeIssues(mixed, "es"), real);

  // для языка без запретов фильтр не выкидывает ничего легитимного
  assert.equal(actionableJudgeIssues(real, "de").length, 2);
});

test("судья: FORBIDDEN SCOPE и BODY PARTS — антиобобщение и антибуквализм (фикс 2026-10-26)", () => {
  const sys = judgeSystem('"speaker:Narrator"');
  // H3 диагностики: пример «pene/vagina FORBIDDEN» судья обобщала на ВСЮ
  // анатомию и требовала «clit» вместо «clítoris», называя его запрещённым
  assert.ok(!sys.includes("pene/vagina"), "пример-перечень убран — он провоцировал обобщение");
  assert.match(sys, /COMPLETENESS IS CHECKED FIRST, clause by clause/, "нет пословного чека полноты");
  assert.match(sys, /Coverage is about MEANING, not word overlap/, "нет правила «смысл, не слова»");
  assert.match(sys, /NEVER report a "drop" for a single word/, "нет запрета ловить одиночные слова");
  assert.match(
    sys,
    /score at most 6 and put "dropped: <the exact source fragment>"/,
    "нет порога при потере содержания",
  );
  assert.match(sys, /FORBIDDEN SCOPE/, "нет правила области запрета");
  assert.match(sys, /NEVER generalize from an example/, "нет запрета обобщать");
  assert.match(sys, /clitoris, clit, thigh\/muslo/, "телесные слова не должны числиться запрещёнными");
  // H3+: судья буквализировала «between her legs -> entre sus piernas» и
  // требовала заменить «thigh» (source) на «entre sus piernas»
  assert.match(sys, /BODY PARTS: translate what the SOURCE says/, "нет правила про части тела");
  assert.match(sys, /applies ONLY when the English says "between her legs"/, "нет запрета буквализировать маппинг");
});

test("medianOf: медиана гасит шум судьи (H1: 8,6,6 -> 6; 9,8,9 -> 9)", () => {
  assert.equal(medianOf([8, 6, 6]), 6);
  assert.equal(medianOf([9, 8, 9]), 9, "одиночный провал 8 не роняет стабильные 9");
  assert.equal(medianOf([6, 9, 8]), 8);
  assert.equal(medianOf([10, 9, 9]), 9);
});

test("судья: COMPLETENESS MAP нумерует предложения многосложного SOURCE (фикс 2026-10-26)", () => {
  // Инцидент: судья 3/3 прогона не замечала потерю целого предложения
  // («Holding onto the wall...» отсутствовало в кандидате), а ставила 8-9
  // за мелочь — судила стиль, не комплектность. Нумерация вынуждает
  // пройтись по каждой части источника.
  const long = mkEntry({
    msgctxt: '"speaker:Narrator"',
    msgid:
      "Sarah still felt every part of her being controlled. Holding onto the wall was the only thing she could manage.",
  });
  const u = judgeUser("es", long, "Sarah seguía sintiendo que la controlaban.", null);
  assert.match(u, /COMPLETENESS MAP/, "нет карты комплектности");
  assert.match(u, /1\. Sarah still felt every part/, "нет нумерации предложений");
  assert.match(u, /2\. Holding onto the wall/, "второе предложение не выделено отдельно");
  assert.match(u, /dropped: <that exact part>/, "нет инструкции про потерю");

  // односложный SOURCE — карту не даём (KISS: не раздуваем промпт)
  const short = mkEntry({ msgctxt: '"speaker:Narrator"', msgid: "No, no." });
  assert.ok(!judgeUser("es", short, "No, no.", null).includes("COMPLETENESS MAP"));
});

test("верификатор замечаний: parseVerdict + промпт с двойной проверкой (фикс 2026-10-26)", () => {
  // живой замер: 5/5 ложных придирок отбито («su -> la», «él -> ella»,
  // «matutinas — anglicism», «use penetración», «mojada -> empapada»)
  assert.equal(parseVerdict('{"verdict":"ACCEPT","why":"ok"}'), true);
  assert.equal(parseVerdict('{"verdict":"REJECT","why":"wrong claim"}'), false);
  assert.equal(parseVerdict('{"verdict": "REJECT"}'), false, "пробел после двоеточия — тоже REJECT");
  assert.equal(parseVerdict("битый ответ без вердикта"), false, "битый JSON = не подтверждено");

  assert.match(VERIFY_ONE_SYSTEM, /spelling, grammar, word function/, "нет шага проверки факта");
  assert.match(VERIFY_ONE_SYSTEM, /the rules mark FORBIDDEN/, "нет проверки FORBIDDEN");
  assert.match(VERIFY_ONE_SYSTEM, /Judge EVERY claim/, "нет проверки каждого утверждения по отдельности");
  assert.match(VERIFY_ONE_SYSTEM, /unrelated to, contradicts/, "нет шага проверки фиделити");
  assert.match(VERIFY_ONE_SYSTEM, /claims content was DROPPED/, "нет шага проверки полноты через SOURCE");
  assert.match(VERIFY_ONE_SYSTEM, /Only if all checks pass, ACCEPT/, "нет требования тройной проверки");
});
