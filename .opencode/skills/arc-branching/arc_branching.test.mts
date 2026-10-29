/**
 * Юнит-тесты arc_branching.mts — парсер .rpy, граф, уровни, рендер.
 * Только фикстуры: реальная игра проверяется в arc_branching_e2e.test.mts.
 * Запуск: node --test .opencode/skills/arc-branching/arc_branching.test.mts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  arcOrder,
  buildLevels,
  buildModel,
  countArcLines,
  parseRpy,
  renderPuml,
  toArcEdges,
} from "./arc_branching.mts";
import { POT_PATH } from "./arc_branching.mts";
import type { RpySource } from "./arc_branching.mts";
import { readFileSync } from "node:fs";

// ─── Фикстуры ─────────────────────────────────────────────────

const SCRIPT = [
  "define e = Character('E')",
  "",
  "label start:",
  '    "hello"',
  "    jump second",
  "",
  "label second:",
  '    "world"',
  "    jump branch1 if player_good",
  "    call branch2",
  "",
  "label branch1:",
  '    "a"',
  "    jump merge",
  "",
  "label branch2:",
  '    "b"',
  "    jump merge",
  "",
  "label merge:",
  '    "end"',
  "    jump inner",
  "",
  "label inner:",
  '    "same arc"',
  "    jump branch1",
  "",
].join("\n");

/** Правило «лейбл → арка» по префиксу — как в игре, но без зависимости от potgen-таблиц. */
const arcOf = (label: string): string | undefined => {
  if (label === "splashscreen") return undefined;
  if (label.startsWith("branch")) return "ChapterOne";
  if (label === "start" || label === "second") return "Prologue";
  if (label === "merge" || label === "inner") return "Finale";
  return "Other";
};

const ALL = new Set(["start", "second", "branch1", "branch2", "merge", "inner"]);

/** Правило для проверки имён арок с пробелом (вне describe — no recreation). */
const spaceArc = (label: string): string | undefined => (label === "start" ? "Arc One" : "Arc Two");

// ─── parseRpy ─────────────────────────────────────────────────

describe("parseRpy", () => {
  it("берёт label в порядке появления, включая параметры и отступы", () => {
    const script = ["label a:", "label b(param):", "  label c:", "label d"].join("\n");
    assert.deepEqual(parseRpy(script).labels, ["a", "b", "c", "d"]);
  });

  it("не ловит слово label внутри строки или комментария", () => {
    const script = ["label real:", '    "jump label fake"', "    # label commented"].join("\n");
    assert.deepEqual(parseRpy(script).labels, ["real"]);
  });

  it("ловит jump и call только внутри блока своего label", () => {
    assert.deepEqual(parseRpy(SCRIPT).jumps, [
      ["start", "second"],
      ["second", "branch1"],
      ["second", "branch2"],
      ["branch1", "merge"],
      ["branch2", "merge"],
      ["merge", "inner"],
      ["inner", "branch1"],
    ]);
  });

  it("переходы до первого label не считаются", () => {
    const script = ["jump orphan", "", "label real:", "    jump target", "", "label target:"].join("\n");
    assert.deepEqual(parseRpy(script).jumps, [["real", "target"]]);
  });
});

// ─── toArcEdges ───────────────────────────────────────────────

describe("toArcEdges", () => {
  it("сводит label-переходы в арочные рёбра с весами", () => {
    const edges = toArcEdges(parseRpy(SCRIPT).jumps, arcOf, ALL);
    // start->second — петля Prologue (мимо); merge->inner — петля Finale (мимо)
    assert.deepEqual(edges, [
      { from: "Prologue", to: "ChapterOne", weight: 2 }, // second->branch1 + second->branch2
      { from: "ChapterOne", to: "Finale", weight: 2 }, // branch1->merge + branch2->merge
      { from: "Finale", to: "ChapterOne", weight: 1 }, // inner->branch1 (возврат)
    ]);
  });

  it("отбрасывает цель, не являющуюся определённым label (call screen foo)", () => {
    const jumps: Array<[string, string]> = [["start", "screen"]];
    assert.deepEqual(toArcEdges(jumps, arcOf, ALL), []);
  });

  it("отбрасывает петли внутри одной арки и label без арки (галерея/splashscreen)", () => {
    const jumps: Array<[string, string]> = [
      ["start", "second"], // одна арка Prologue
      ["merge", "inner"], // одна арка Finale
      ["splashscreen", "start"], // у splashscreen арки нет
    ];
    assert.deepEqual(toArcEdges(jumps, arcOf, ALL), []);
  });

  it("имена арок с пробелом не рвут ключ (NUL-разделитель)", () => {
    const edges = toArcEdges([["start", "second"]], spaceArc, new Set(["start", "second"]));
    assert.deepEqual(edges, [{ from: "Arc One", to: "Arc Two", weight: 1 }]);
  });

  it("одинаковые переходы схлопываются в вес", () => {
    const jumps: Array<[string, string]> = [
      ["start", "branch1"],
      ["second", "branch1"],
      ["start", "branch1"],
    ];
    assert.deepEqual(toArcEdges(jumps, arcOf, ALL), [{ from: "Prologue", to: "ChapterOne", weight: 3 }]);
  });
});

// ─── arcOrder / buildLevels ───────────────────────────────────

describe("arcOrder", () => {
  it("даёт уникальные арки в порядке первого появления лейбла", () => {
    const order = parseRpy(SCRIPT).labels;
    assert.deepEqual(arcOrder(order, arcOf), ["Prologue", "ChapterOne", "Finale"]);
  });
});

describe("buildLevels", () => {
  it("строит уровни как BFS-глубину от стартовых арок", () => {
    const arcs = ["Root", "Mid", "Leaf", "Island"];
    const edges = [
      { from: "Root", to: "Mid", weight: 1 },
      { from: "Mid", to: "Leaf", weight: 1 },
    ];
    const m = buildLevels(arcs, edges);
    assert.deepEqual(m.roots, ["Root", "Island"]);
    assert.equal(m.depth.get("Root"), 0);
    assert.equal(m.depth.get("Mid"), 1);
    assert.equal(m.depth.get("Leaf"), 2);
    assert.equal(m.depth.get("Island"), 0);
    assert.deepEqual(m.levels, [["Root", "Island"], ["Mid"], ["Leaf"]]);
  });

  it("выбирает кратчайшую глубину в цикле (без зацикливания BFS)", () => {
    const arcs = ["A", "B", "C"];
    const edges = [
      { from: "A", to: "B", weight: 1 },
      { from: "B", to: "C", weight: 1 },
      { from: "C", to: "A", weight: 1 },
      { from: "C", to: "B", weight: 1 },
    ];
    const m = buildLevels(arcs, edges);
    assert.equal(m.depth.get("A"), 0);
    assert.equal(m.depth.get("B"), 1);
    assert.equal(m.depth.get("C"), 2);
  });

  it("без корней (сплошной цикл) стартует с первой арки, а не падает", () => {
    const m = buildLevels(
      ["X", "Y"],
      [
        { from: "X", to: "Y", weight: 1 },
        { from: "Y", to: "X", weight: 1 },
      ],
    );
    assert.deepEqual(m.roots, ["X"]);
    assert.equal(m.levels.length, 2);
  });

  it("находит все корни, если ветвление идёт сразу от нескольких", () => {
    const m = buildLevels(
      ["S1", "S2", "Down"],
      [
        { from: "S1", to: "Down", weight: 1 },
        { from: "S2", to: "Down", weight: 1 },
      ],
    );
    assert.deepEqual(m.roots, ["S1", "S2"]);
  });
});

// ─── buildModel ───────────────────────────────────────────────

describe("buildModel", () => {
  it("склеивает несколько файлов в одну модель (порядок = порядок файлов)", () => {
    const sources: RpySource[] = [
      { path: "script.rpy", text: SCRIPT },
      {
        path: "side.rpy",
        text: ["label start:", "    jump extra", "", "label extra:", "    pass"].join("\n"),
      },
    ];
    const m = buildModel(sources, arcOf);
    // арки script.rpy первыми, extra-арка из второго файла — в конце
    assert.deepEqual(m.arcs, ["Prologue", "ChapterOne", "Finale", "Other"]);
    assert.deepEqual(m.roots, ["Prologue"]);
  });

  it("лейблы галереи/реплеев не несут арку (NO_ARC_FILES)", () => {
    const sources: RpySource[] = [
      { path: "script.rpy", text: "label start:\n    jump galleryView\n" },
      { path: "replay_gallery.rpy", text: "label galleryView:\n    pass" },
    ];
    const m = buildModel(sources, arcOf);
    assert.deepEqual(m.arcs, ["Prologue"], "лейбл реплея не должен дать арку");
    assert.deepEqual(m.edges, []);
  });

  it("без своего правила использует реальные правила игры (потgen-таблицы)", () => {
    // Гард инъекции: по умолчанию арка выводится из реальных имён лейблов
    // (ARC_BY_PREFIX в potgen): OpeningScene* -> Prologue, TrainingPath* -> Training.
    const script = [
      "label OpeningScene1:",
      "    jump TrainingPathKate1",
      "",
      "label TrainingPathKate1:",
      "    pass",
    ].join("\n");
    const m = buildModel([{ path: "script.rpy", text: script }]);
    assert.deepEqual(m.arcs, ["Prologue", "Training"]);
  });

  it("детерминирован для одних и тех же источников", () => {
    const sources: RpySource[] = [{ path: "script.rpy", text: SCRIPT }];
    assert.deepEqual(buildModel(sources, arcOf), buildModel(sources, arcOf));
  });
});

describe("countArcLines", () => {
  const pot = [
    'msgid ""',
    'msgstr ""',
    '"Project-Id-Version: x\\n"',
    "",
    "#. arc: Prologue",
    "#. uid: aaaa",
    'msgctxt "speaker:Narrator"',
    'msgid "First line"',
    'msgstr ""',
    "",
    "#. arc: Prologue",
    'msgctxt "speaker:Sarah"',
    'msgid "Second line"',
    'msgstr ""',
    "",
    "#. arc: Prologue",
    'msgctxt "menu"',
    'msgid "Choose"',
    'msgstr ""',
    "",
    "#. arc: HollowWorld",
    'msgctxt "speaker:Narrator"',
    'msgid "HW line"',
    'msgstr ""',
    "",
    "#. scene: OutsideLabel",
    'msgctxt "speaker:Narrator"',
    'msgid "No arc here"',
    'msgstr ""',
    "",
  ].join("\n");

  it("считает только реплики (speaker-контекст) по аркам", () => {
    assert.deepEqual(
      [...countArcLines(pot).entries()],
      [
        ["Prologue", 2], // меню "Choose" не считается
        ["HollowWorld", 1],
      ],
    );
  });

  it("заголовок POT (пустой msgid) не попадает в счёт", () => {
    const counts = countArcLines('msgid ""\nmsgstr ""\n"Header\\n"\n');
    assert.equal(counts.size, 0);
  });

  it("сумма по реальному POT = 68 357 строк корпуса", () => {
    const real = readFileSync(POT_PATH, "utf8");
    const total = [...countArcLines(real).values()].reduce((s, n) => s + n, 0);
    assert.equal(total, 68357, "счётчик разошёлся с фактическим корпусом");
  });
});

// ─── renderPuml ───────────────────────────────────────────────

describe("renderPuml", () => {
  const model = buildModel([{ path: "script.rpy", text: SCRIPT }], arcOf);
  const text = renderPuml(model);

  it("обёрнут в @startuml/@enduml и содержит все арки", () => {
    assert.match(text, /^@startuml\n/);
    assert.match(text, /@enduml\n$/);
    for (const arc of model.arcs) {
      assert.ok(text.includes(`state "${arc}"`), `нет state ${arc}`);
    }
  });

  it("рисует уровни composite-state'ами по возрастанию", () => {
    const levels = [...text.matchAll(/state "Уровень (\d+)" as LEVEL\d+ \{/g)].map((m) => Number(m[1]));
    assert.deepEqual(levels, [0, 1, 2]);
    const i0 = text.indexOf('state "Уровень 0" as LEVEL0 {');
    const i1 = text.indexOf('state "Уровень 1" as LEVEL1 {');
    const i2 = text.indexOf('state "Уровень 2" as LEVEL2 {');
    assert.ok(i0 < i1 && i1 < i2, "блоки уровней идут по порядку");
    // package в state-режиме — Syntax Error на plantuml.com (2026-10-29)
    assert.ok(!text.includes("\npackage "), "использован запрещённый package");
  });

  it("старт подключён ко всем корням", () => {
    assert.ok(text.includes("START --> Prologue"));
  });

  it("прямые переходы нарисованы, обратные вынесены в легенду (не жгут)", () => {
    // Prologue(0) -> ChapterOne(1): вперёд -> сплошная
    assert.ok(text.includes("Prologue --> ChapterOne"), "нет прямого перехода");
    // ChapterOne(1) -> Finale(2): вперёд
    assert.ok(text.includes("ChapterOne --> Finale"), "нет прямого перехода глубже");
    // Finale(2) -> ChapterOne(1): назад -> НЕ нарисован, но перечислен в легенде
    assert.ok(!text.includes("Finale -[dotted]->"), "обратная стрелка не должна рисоваться");
    assert.ok(
      /Возвраты\/петли \(\d+, не нарисованы\):\n\s+Finale -> ChapterOne \(1\)/.test(text),
      "нет возврата в легенде",
    );
  });

  it("не содержит activity-конструкций, непонятных jebbs.plantuml", () => {
    for (const bad of ["goto ", "detach", "elseif", "\nstart\n"]) {
      assert.ok(!text.includes(bad), `найдена конструкция activity: ${bad}`);
    }
  });

  it("детерминирован — два рендера дают байт-в-байт одинаковый текст", () => {
    assert.equal(renderPuml(buildModel([{ path: "script.rpy", text: SCRIPT }], arcOf)), text);
  });
});
