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
  isRunning,
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
