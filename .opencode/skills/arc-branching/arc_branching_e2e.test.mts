/**
 * E2E: диаграмма ветвления против реальной установки TSSR (Steam, read-only).
 *
 * Единственный источник — сама игра (game/*.rpy, мимо tl/mods/renpy).
 * Прогоняется там, где игра установлена (или задан TSSR_GAME); без
 * установки — скип. Проверяет, что модель из РЕАЛЬНЫХ файлов даёт
 * связную диаграмму, а закоммиченный .puml не устарел.
 *
 * Запуск: node --test .opencode/skills/arc-branching/arc_branching_e2e.test.mts
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { DEFAULT_OUT, GAME, buildModel, loadModel, renderPuml } from "./arc_branching.mts";
import { collectRpyFiles } from "../renpy-po/game_source.mts";

const HAVE_GAME = existsSync(GAME);
const SKIP = HAVE_GAME ? false : `нет установки игры: ${GAME}`;

test("модель из реальных .rpy игры", { skip: SKIP }, () => {
  const model = loadModel();

  // Факты игры: ~19 арок, больше десятка переходов, ветвление с уровнями.
  assert.ok(model.arcs.length >= 10 && model.arcs.length <= 40, `неожиданное число арок: ${model.arcs.length}`);
  assert.ok(model.edges.length >= 10, `слишком мало переходов: ${model.edges.length}`);
  assert.ok(model.levels.length >= 2, `нет уровней (диаграмма плоская): ${model.levels.length}`);

  // Корни реально в списке арок.
  for (const r of model.roots) assert.ok(model.arcs.includes(r), `корень ${r} не в списке арок`);

  // Каждое ребро ссылается на существующие арки, вес положителен.
  const set = new Set(model.arcs);
  for (const e of model.edges) {
    assert.ok(set.has(e.from) && set.has(e.to), `ребро в никуда: ${e.from} -> ${e.to}`);
    assert.ok(e.weight > 0, `не-positive вес у ${e.from} -> ${e.to}`);
  }

  // Каждая арка ровно на одном уровне (ни потерь, ни дублей).
  const seen = new Set<string>();
  for (const level of model.levels) {
    for (const a of level) {
      assert.ok(!seen.has(a), `арка ${a} на двух уровнях`);
      seen.add(a);
    }
  }
  assert.equal(seen.size, model.arcs.length, "уровни не покрывают все арки");
});

test("рендер реальной диаграммы валиден для jebbs.plantuml", { skip: SKIP }, () => {
  const model = loadModel();
  const text = renderPuml(model);

  assert.match(text, /^@startuml\n/);
  assert.match(text, /@enduml\n$/);
  assert.ok(text.includes('state "СТАРТ"'), "нет стартового узла");
  assert.ok(text.includes('state "Уровень 0" as LEVEL0 {'), "нет уровней");

  // activity-beta конструкции — Syntax Error в превью VS Code (проверено 2026-10-29).
  for (const bad of ["goto ", "detach", "elseif", "\nstart\n"]) {
    assert.ok(!text.includes(bad), `activity-конструкция в output: ${bad}`);
  }

  // Каждая арка — ровно один state-узел; «СТАРТ» и composite-уровни (LEVEL*) — служебные.
  const ids = [...text.matchAll(/^\s*state "(.+)" as (\S+)/gm)]
    .filter((m) => !m[2].startsWith("LEVEL") && m[2] !== "START")
    .map((m) => m[1]);
  assert.deepEqual(ids.toSorted(), model.arcs.toSorted(), "state-узлы не совпадают с арками");
});

test("игровые .rpy читаются без сторонних артефактов", { skip: SKIP }, () => {
  // Гард «источник один»: модель обязаны давать РЕАЛЬНЫЕ файлы игры,
  // собранные collectRpyFiles, а не скрытые кэши/промежуточные форматы.
  const files = collectRpyFiles(GAME);
  assert.ok(files.length >= 1, "не найдено ни одного .rpy в игре");
  assert.ok(
    files.some((f) => f.endsWith("script.rpy")),
    "script.rpy не попал в чтение",
  );

  const fromFiles = buildModel(files.map((path) => ({ path, text: readFileSync(path, "utf8") })));
  const viaLoader = loadModel();
  // Структура ветвления — ТОЛЬКО из файлов игры (поля идентичны);
  // `lines` — единственный вычислимый аннотированный слой: счётчик строк из
  // POT (дедуп по uid = объём реальной озвучки), он НЕ влияет на граф.
  const { lines: _linesFromLoader, ...viaStruct } = viaLoader;
  assert.deepEqual(fromFiles, viaStruct, "структура loadModel != прямое чтение тех же файлов игры");
  assert.ok(viaLoader.lines && viaLoader.lines.size > 0, "нет счётчика строк из POT");
  assert.equal(
    [...(viaLoader.lines?.values() ?? [])].reduce((s, n) => s + n, 0),
    68357,
    "общий объём строк разошёлся с корпусом (68 357)",
  );

  // tl/ в чтение не попадает (переводы — не источник ветвления).
  assert.ok(!files.some((f) => `${f}`.replace(/\\/g, "/").includes("/tl/")), "прочитаны файлы перевода");
});

test("коммиченный docs/game-branching.puml не устарел", { skip: SKIP }, () => {
  // Гард актуальности: файл в репе обязан совпадать со свежей генерацией —
  // после обновления игры падает с просьбой перегенерировать.
  if (!existsSync(DEFAULT_OUT)) {
    assert.fail(
      "docs/game-branching.puml отсутствует — запусти: node .opencode/skills/arc-branching/arc_branching.mts",
    );
  }
  const fresh = renderPuml(loadModel());
  const committed = readFileSync(DEFAULT_OUT, "utf8");
  assert.equal(
    committed,
    fresh,
    "docs/game-branching.puml устарел — перегенерируй: node .opencode/skills/arc-branching/arc_branching.mts",
  );
});
