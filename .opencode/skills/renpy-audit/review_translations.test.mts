import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parsePairs, classify, norm, ENGINE_FILE } from "./review_translations.mts";
import type { PairMap } from "./review_translations.mts";

// ─── Helpers ──────────────────────────────────────────────────

function makeMap(entries: Array<[string, string | null, string]>): PairMap {
  const map: PairMap = new Map();
  for (const [old, newVal, file] of entries) {
    map.set(norm(old), { old, new: newVal, file });
  }
  return map;
}

// ─── Tests: parsePairs ────────────────────────────────────────

describe("parsePairs", () => {
  it("parses old/new pairs inside translate block", () => {
    const content = ["translate ru strings:", "", '    old "Hello"', '    new "Привет"', ""].join("\n");
    const pairs = parsePairs(content);
    assert.deepEqual(pairs, [{ old: "Hello", new: "Привет" }]);
  });

  it("ignores lines outside translate block", () => {
    const content = ['old "Not a block"', 'new "Не блок"', "translate ru strings:", '    old "In"', '    new "В"'].join(
      "\n",
    );
    const pairs = parsePairs(content);
    assert.deepEqual(pairs, [{ old: "In", new: "В" }]);
  });

  it("handles escaped quotes and backslashes", () => {
    const content = [
      "translate ru strings:",
      '    old "He said \\"hi\\\\" twice"',
      '    new "Он сказал \\"привет\\\\" дважды"',
    ].join("\n");
    const pairs = parsePairs(content);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].old, 'He said "hi\\" twice');
    assert.equal(pairs[0].new, 'Он сказал "привет\\" дважды');
  });

  it("missing new -> null", () => {
    const content = ["translate ru strings:", '    old "Only old"', "    # comment"].join("\n");
    const pairs = parsePairs(content);
    assert.deepEqual(pairs, [{ old: "Only old", new: null }]);
  });

  it("stops translate context after foreign line", () => {
    const content = [
      "translate ru strings:",
      '    old "First"',
      '    new "Первый"',
      "label some_label:",
      '    old "Not in block"',
    ].join("\n");
    const pairs = parsePairs(content);
    assert.equal(pairs.length, 1);
  });
});

// ─── Tests: classify ──────────────────────────────────────────

describe("classify", () => {
  it("splits dropped/added/missing/lost/notInGame correctly", () => {
    // head: a(переведена), b(не переведена), c(переведена), d(переведена)
    const head = makeMap([
      ["A old", "А-перевод", "file1.rpy"],
      ["B old", "B old", "file1.rpy"],
      ["C old", "С-перевод", "file2.rpy"],
      ["D old", "Д-перевод", "file2.rpy"],
    ]);
    // work: a(перевод сохранился), d(перевод потерян -> new==old), e(сирота), f(переведена)
    const work = makeMap([
      ["A old", "А-перевод", "file1.rpy"],
      ["D old", "D old", "file2.rpy"],
      ["E old", "E old", "file3.rpy"],
      ["F old", "Ф-перевод", "file3.rpy"],
    ]);
    // игра: a, c(строка ещё в игре!), d, e, g(нет пары)
    const gameOlds = new Set(["A old", "C old", "D old", "E old", "G old"].map(norm));

    const r = classify(head, work, gameOlds);

    const droppedKeys = r.dropped.map((p) => norm(p.old)).sort();
    assert.deepEqual(droppedKeys, [norm("B old"), norm("C old")]);

    const addedKeys = r.added.map((p) => norm(p.old)).sort();
    assert.deepEqual(addedKeys, [norm("E old"), norm("F old")]);

    // F в игре нет -> сирота; C (dropped, но ещё в игре) тоже попадает в missing
    assert.deepEqual(
      r.notInGame.map((p) => norm(p.old)),
      [norm("F old")],
    );

    assert.deepEqual(r.missing.slice().sort(), [norm("C old"), norm("G old")].sort());

    // LOST: только C (был перевод, old ещё в игре); B — untranslated, D — не dropped
    assert.deepEqual(
      r.lostTranslations.map((p) => norm(p.old)),
      [norm("C old")],
    );
    assert.equal(r.lostTranslations[0].file, "file2.rpy");
  });

  it("D with lost translation (new reset to old) is NOT lost when old gone from game", () => {
    const head = makeMap([["X", "Х-перевод", "f.rpy"]]);
    const work: PairMap = new Map(); // X выпал из рабочей копии
    const gameOlds = new Set<string>(); // и в игре его больше нет
    const r = classify(head, work, gameOlds);
    assert.equal(r.dropped.length, 1);
    assert.equal(r.lostTranslations.length, 0);
  });

  it("excludes engine file from notInGame", () => {
    const head = makeMap([]);
    const work = makeMap([["Engine string", "Engine string", `patches/tl/ru/${ENGINE_FILE}`]]);
    const gameOlds = new Set<string>(); // engine-строки вне скана игры
    const r = classify(head, work, gameOlds);
    assert.equal(r.notInGame.length, 0);
  });

  it("untranslated dropped pair with old still in game is DROPPED but not LOST", () => {
    const head = makeMap([["Same", "Same", "f.rpy"]]);
    const work: PairMap = new Map();
    const gameOlds = new Set([norm("Same")]);
    const r = classify(head, work, gameOlds);
    assert.equal(r.dropped.length, 1);
    assert.equal(r.lostTranslations.length, 0);
  });
});
