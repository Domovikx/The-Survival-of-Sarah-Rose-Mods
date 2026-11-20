/**
 * dashboard.test.mts — гарды для пульта: то, что уже ломалось, и то, что легко
 * сломать молча (проценты, «сколько арок закрыто», счётчики po, план озвучки).
 *
 * Запуск: npm run test:dash
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { parsePo } from "../renpy-po/po_core.mts";
import { arcsClosed, countPo } from "./dashboard.mts";

/** Перевод строки без ESC-последовательностей: heredoc уже дважды превращал
 *  "
" в реальный перенос внутри литерала. */
const NL = String.fromCharCode(10);
import { loadCatalog } from "../../../patches/ai-voice-pack/tools/generate/scripts/voice_batch.mts";
import { plan, voiceLangs } from "../../../patches/ai-voice-pack/tools/generate/scripts/voice_status.mts";

const map = (o: Record<string, number>) => new Map(Object.entries(o));

// ------------------------------------------------------------ арки -----

test("arcsClosed: пустой корпус не закрывает ни одной арки", () => {
  // Регресс 2026-11-16: `made ?? 0 >= plan` (приоритет операторов) давал 19/19
  // при 2 % озвучки — здесь план есть, а сделано ничего.
  assert.equal(arcsClosed(map({}), map({ Prologue: 238, WarArc: 703 })), 0);
});

test("arcsClosed: закрывает только те арки, где сделано >= плана", () => {
  const plan = map({ Prologue: 238, WarArc: 703, Other: 10 });
  assert.equal(arcsClosed(map({ Prologue: 238, WarArc: 700 }), plan), 1);
  assert.equal(arcsClosed(map({ Prologue: 238, WarArc: 703, Other: 10 }), plan), 3);
  // Перебор (остатки старых файлов) тоже считается закрытой аркой.
  assert.equal(arcsClosed(map({ Other: 12 }), plan), 1);
});

test("arcsClosed: арка с нулевым планом не считается закрытой", () => {
  // План 0 = в этой арке нечего озвучивать на языке: «закрыта» была бы ложью.
  assert.equal(arcsClosed(map({ Prologue: 5 }), map({ Prologue: 0 })), 0);
  assert.equal(arcsClosed(map({ Prologue: 0 }), map({ Prologue: 0 })), 0);
});

test("arcsClosed: не мутирует входные мапы", () => {
  const made = map({ Prologue: 238 });
  const planM = map({ Prologue: 238, WarArc: 703 });
  arcsClosed(made, planM);
  assert.deepEqual([...made.keys()], ["Prologue"]);
  assert.deepEqual([...planM.keys()], ["Prologue", "WarArc"]);
});

// ------------------------------------------------------- счётчик po -----

test("countPo: шапка файла не считается строкой, перевод из 1 символа — считается", () => {
  const text = [
    "# комментарий",
    'msgid ""',
    'msgstr ""',
    '"Project-Id-Version: test\\n"',
    '"Language: xx\\n"',
    "",
    'msgid "First line"',
    'msgstr "A"',
    "",
    'msgid "Second line"',
    'msgstr ""',
    "",
  ].join(NL);
  // Регресс 2026-11-16: старый счёт давал 1 из 2 (шапка «съедала» единицу,
  // а `..+` пропускал перевод длиной в один символ).
  assert.deepEqual(countPo(text), { filled: 1, total: 2 });
});

test("countPo: на живом po сходится с parsePo (ru)", () => {
  const file = join("patches", "ai-voice-pack", "po", "ru.po");
  const text = readFileSync(file, "utf-8");
  const mine = countPo(text);
  const entries = parsePo(text.replace(/\r\n/g, "\n")).filter((e) => e.msgid);
  assert.equal(mine.total, entries.length);
  assert.equal(mine.filled, entries.filter((e) => e.msgstr.trim()).length);
});

// ------------------------------------------------- план озвучки --------

test("voiceLangs: набор = папки audio/, порядок из language-priority.json", () => {
  const langs = voiceLangs();
  assert.ok(langs.length > 0, "в audio/ нет языков");
  const cfg = JSON.parse(readFileSync(join("config", "language-priority.json"), "utf-8")) as {
    languages: Array<{ code: string }>;
  };
  const rank = (l: string): number => cfg.languages.findIndex((x) => x.code === l);
  const ordered = langs.filter((l) => rank(l) >= 0);
  assert.deepEqual(
    ordered,
    [...ordered].sort((a, b) => rank(a) - rank(b)),
    "порядок языков должен идти по приоритету",
  );
  // en — первым по статистике Steam; ru/en в списке обязаны быть.
  assert.ok(langs.includes("en") && langs.includes("ru"));
});

test("plan(en) = все озвучиваемые фразы POT, остальные языки не больше", () => {
  const all = loadCatalog("en").filter((e) => e.category === "dialogue" || e.category === "narration");
  const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);
  const en = sum(plan("en"));
  assert.equal(en, all.length, "en звучится по оригиналу — план равен всем репликам POT");
  // Остальные языки озвучиваются только по переведённым строкам: план не может
  // быть больше, чем у en (регресс «100 % озвучки при 3 % перевода»).
  for (const lang of voiceLangs()) {
    if (lang === "en") continue;
    assert.ok(sum(plan(lang)) <= en, `${lang}: план озвучки больше, чем реплик в POT`);
  }
});

// Очередь озвучки теперь считается по корпусу (mtime файлов по контракту),
// её чистая часть (rateFrom/isRecording/scanCorpus) покрыта
// `scripts/voice_progress.test.mts` — дублировать парсер логов больше нечего.
