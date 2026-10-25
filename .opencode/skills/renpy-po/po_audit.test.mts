/**
 * po_audit.test.mts — юнит-тесты аудитора переводов.
 * node --test .opencode/skills/renpy-po/po_audit.test.mts
 *
 * Покрывает ЧИСТУЮ логику классов (auditEntry) — файлы po не трогаем:
 * applyFix проверяется вручную/на реальном прогоне аудита.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { auditEntry, auditLang } from "./po_audit.mts";
import type { PoEntry } from "./po_core.mts";

const mk = (msgid: string, msgstr: string, msgctxt = '"ui"'): PoEntry => ({
  msgctxt,
  msgid,
  msgstr,
  refs: [],
  comments: [],
  flags: [],
  translator: [],
});

test("класс A: символьный msgid ≠ идентичность — галлюцинация, fix=ident", () => {
  const cases: Array<[string, string, string]> = [
    ["pl", "<", "<A Brief Investigation on Ethics>"],
    ["zh", "<", "《伦理学简史》作者：路凡"],
    ["de", "<", "< ui >"],
    ["pt", "<", "<\n\n>"],
    ["ko", "<", "윤리학에 대한 간략한 조사"],
  ];
  for (const [lang, mid, tr] of cases) {
    const a = auditEntry(lang, mk(mid, tr));
    assert.equal(a.length, 1, `${lang}: ждали 1 аномалию`);
    assert.equal(a[0].cls, "A");
    assert.equal(a[0].action, "ident");
  }
  // идентичность и пустой — не аномалия
  assert.deepEqual(auditEntry("pl", mk("<", "<")), []);
  assert.deepEqual(auditEntry("fr", mk("<", "")), []); // пустые — не аудируем (их ведёт очередь)
});

test("класс B: msgstr == msgid с буквами — только отчёт", () => {
  const a = auditEntry("ru", mk("Ctrl", "Ctrl", '"ui"'));
  assert.equal(a.length, 1);
  assert.equal(a[0].cls, "B");
  assert.equal(a[0].action, "report-only");
  // русская реплика, скопированная с английской — тоже B, но НЕ чинится автоматом
  const speech = auditEntry("ru", mk("No.", "No.", '"speaker:Sarah"'));
  assert.equal(speech[0]?.cls, "B");
  assert.equal(speech[0]?.action, "report-only");
});

test("класс C: чужая письменность — fix=retranslate", () => {
  const pl = auditEntry("pl", mk("Thomas", "Томас", '"speaker-name"'));
  assert.equal(pl[0]?.cls, "C");
  assert.equal(pl[0]?.action, "retranslate");
  // кириллическая «е» внутри испанского слова (реальный кейс из es.po)
  const es = auditEntry("es", mk("The mass writhes and twists.", "La masa se retuercе y gira."));
  assert.equal(es[0]?.cls, "C");
  assert.ok(es[0]?.why.includes("кириллица"));
  // CJK в русском
  const ru = auditEntry("ru", mk("She was tired.", "她很累。"));
  assert.equal(ru[0]?.cls, "C");
  // своя письменность — чисто
  assert.deepEqual(auditEntry("ru", mk("She was tired.", "Она устала.")), []);
  assert.deepEqual(auditEntry("es", mk("She was tired.", "Estaba cansada.")), []);
});

test("класс D: короткий UI → длинный бред — fix=retranslate", () => {
  const a = auditEntry("es", mk("Load", "Carga la mercancía, trabaja en el barco, haz lo que necesites.", '"ui"'));
  assert.equal(a[0]?.cls, "D");
  assert.equal(a[0]?.action, "retranslate");
  // нормальная кнопка — не аномалия
  assert.deepEqual(auditEntry("es", mk("Load", "Cargar", '"ui"')), []);
  // длинный msgid с длинным переводом — не D
  assert.deepEqual(auditEntry("es", mk("She was tired but happy.", "Estaba cansada pero muy feliz.")), []);
});

test("одна запись может дать несколько классов (C+D)", () => {
  const a = auditEntry("es", mk("Load", "Загружай carga la mercancía, trabaja en el barco, muy largo."));
  const clss = a.map((x) => x.cls).sort();
  assert.deepEqual(clss, ["C", "D"]);
});

test("auditLang: неизвестный/отсутствующий язык — пусто, без краша", () => {
  assert.deepEqual(auditLang("xx"), []);
});
