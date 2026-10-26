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
  parseArgs,
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
  assert.ok(speech.indexOf("LANGUAGE GATE") < speech.indexOf("EN:"), "гейт должен быть ДО источника");
  const ui = judgeUser("pl", mkEntry({ msgctxt: '"ui"', msgid: "Keyboard" }), "Klawiatura", null);
  assert.match(ui, /Polski \(pl\)/);
  assert.ok(!ui.includes("emotion:"), "UI-гейт без эмоции");
});
