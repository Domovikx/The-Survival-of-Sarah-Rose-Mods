import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { analyzeContent, formatStatus, formatCopyReady } from "./list_translation_files.mts";

function makeTempDir(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "ltf-test-"));
  return {
    path: dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// ─── Tests: analyzeContent ──────────────────────────────────────

describe("analyzeContent", () => {
  it("returns zeroes for empty content", () => {
    const r = analyzeContent("");
    assert.deepEqual(r, { total: 0, translated: 0 });
  });

  it("detects untranslated strings (old === new)", () => {
    const content = ["translate ru strings:", '    old "Hello world"', '    new "Hello world"', ""].join("\n");
    const r = analyzeContent(content);
    assert.deepEqual(r, { total: 1, translated: 0 });
  });

  it("detects translated strings (old !== new)", () => {
    const content = ["translate ru strings:", '    old "Hello world"', '    new "Привет мир"', ""].join("\n");
    const r = analyzeContent(content);
    assert.deepEqual(r, { total: 1, translated: 1 });
  });

  it("counts mixed translated/untranslated", () => {
    const content = [
      "translate ru strings:",
      '    old "Hello"',
      '    new "Привет"',
      '    old "World"',
      '    new "World"',
      '    old "Foo"',
      '    new "Бар"',
      "",
    ].join("\n");
    const r = analyzeContent(content);
    assert.deepEqual(r, { total: 3, translated: 2 });
  });

  it("ignores lines outside translate block", () => {
    const content = [
      "# -*- encoding: utf-8 -*-",
      'define e = Character("Eileen")',
      "",
      "translate ru strings:",
      '    old "Only this"',
      '    new "Только это"',
      "",
      "label start:",
      '    "Not counted."',
    ].join("\n");
    const r = analyzeContent(content);
    assert.deepEqual(r, { total: 1, translated: 1 });
  });

  it("handles escaped quotes in old/new", () => {
    const content = [
      "translate ru strings:",
      '    old "She said \\"hello\\""',
      '    new "Она сказала \\"привет\\""',
      "",
    ].join("\n");
    const r = analyzeContent(content);
    assert.deepEqual(r, { total: 1, translated: 1 });
  });

  it("multiple translate blocks in one file", () => {
    const content = [
      "translate ru strings:",
      '    old "A"',
      '    new "A"',
      "",
      "translate ru strings:",
      '    old "B"',
      '    new "Б"',
      "",
    ].join("\n");
    const r = analyzeContent(content);
    assert.deepEqual(r, { total: 2, translated: 1 });
  });

  it("ignores lines starting with # inside translate block", () => {
    const content = [
      "translate ru strings:",
      "    # This is a comment",
      '    old "Hello"',
      '    new "Привет"',
      "",
    ].join("\n");
    const r = analyzeContent(content);
    assert.deepEqual(r, { total: 1, translated: 1 });
  });

  it("handles empty old/new strings", () => {
    const content = ["translate ru strings:", '    old ""', '    new ""', ""].join("\n");
    const r = analyzeContent(content);
    assert.deepEqual(r, { total: 1, translated: 0 });
  });
});

// ─── Tests: formatStatus ────────────────────────────────────────

describe("formatStatus", () => {
  it("reports empty arcs map gracefully", () => {
    const out = formatStatus({});
    assert.ok(out.includes("Translation status"));
    assert.ok(out.includes("game/tl/ru"));
  });

  it("shows DONE for fully translated arc", () => {
    const arcs = {
      Prologue: [
        {
          path: "game/tl/ru/Prologue/Scene1.rpy",
          stats: { total: 5, translated: 5 },
        },
      ],
    };
    const out = formatStatus(arcs);
    assert.ok(out.includes("[DONE        ]"));
    assert.ok(out.includes("Prologue/"));
    assert.ok(out.includes("5/5"));
  });

  it("shows NOT_STARTED for zero translated arc", () => {
    const arcs = {
      SailorPath: [
        {
          path: "game/tl/ru/SailorPath/Sailor1.rpy",
          stats: { total: 10, translated: 0 },
        },
      ],
    };
    const out = formatStatus(arcs);
    assert.ok(out.includes("[NOT_STARTED ]"));
    assert.ok(out.includes("SailorPath/"));
    assert.ok(out.includes("0/10"));
  });

  it("shows PARTIAL for mixed arc", () => {
    const arcs = {
      MagePath: [
        {
          path: "game/tl/ru/MagePath/Mage1.rpy",
          stats: { total: 20, translated: 10 },
        },
      ],
    };
    const out = formatStatus(arcs);
    assert.ok(out.includes("[PARTIAL     ]"));
    assert.ok(out.includes("10/20"));
    assert.ok(out.includes("50.0%"));
  });

  it("shows PART and NONE markers per file", () => {
    const arcs = {
      Other: [
        { path: "game/tl/ru/Other/DoneFile.rpy", stats: { total: 3, translated: 3 } },
        { path: "game/tl/ru/Other/EmptyFile.rpy", stats: { total: 0, translated: 0 } },
        { path: "game/tl/ru/Other/NoneFile.rpy", stats: { total: 5, translated: 0 } },
        { path: "game/tl/ru/Other/PartFile.rpy", stats: { total: 4, translated: 2 } },
      ],
    };

    // Without --all, DONE files are hidden
    let out = formatStatus(arcs, false);
    assert.ok(!out.includes("DoneFile"));
    assert.ok(out.includes("EmptyFile"));
    assert.ok(out.includes("NoneFile"));
    assert.ok(out.includes("PartFile"));

    // With --all, DONE files are shown
    out = formatStatus(arcs, true);
    assert.ok(out.includes("DoneFile"));
    assert.ok(out.includes("EmptyFile"));
    assert.ok(out.includes("NoneFile"));
    assert.ok(out.includes("PartFile"));
    assert.ok(out.includes("[DONE]"));
    assert.ok(out.includes("[EMPTY]"));
    assert.ok(out.includes("[NONE]"));
    assert.ok(out.includes("[PART]"));
  });

  it("labels __root__ arc correctly", () => {
    const arcs = {
      __root__: [{ path: "game/tl/ru/screens.rpy", stats: { total: 10, translated: 5 } }],
    };
    const out = formatStatus(arcs);
    assert.ok(out.includes("root files"));
    assert.ok(out.includes("misc_strings.rpy"));
    assert.ok(out.includes("screens.rpy"));
  });
});

// ─── Tests: formatCopyReady ─────────────────────────────────────

describe("formatCopyReady", () => {
  const sampleArcs = {
    MagePath: [
      { path: "game/tl/ru/MagePath/Mage1.rpy", stats: { total: 20, translated: 20 } },
      { path: "game/tl/ru/MagePath/Mage2.rpy", stats: { total: 10, translated: 0 } },
    ],
    SailorPath: [{ path: "game/tl/ru/SailorPath/Sailor1.rpy", stats: { total: 15, translated: 0 } }],
    __root__: [{ path: "game/tl/ru/screens.rpy", stats: { total: 100, translated: 50 } }],
  };

  it("mode=arcs: lists arc folders only, no root", () => {
    const out = formatCopyReady(sampleArcs, "arcs");
    const lines = out.split("\n");
    assert.deepEqual(lines, ["game/tl/ru/MagePath", "game/tl/ru/SailorPath"]);
  });

  it("mode=files-untranslated: lists files with incomplete translation", () => {
    const out = formatCopyReady(sampleArcs, "files-untranslated");
    const lines = out.split("\n");
    assert.ok(lines.includes("game/tl/ru/MagePath/Mage2.rpy"));
    assert.ok(lines.includes("game/tl/ru/SailorPath/Sailor1.rpy"));
    assert.ok(lines.includes("game/tl/ru/screens.rpy"));
    assert.ok(!lines.includes("game/tl/ru/MagePath/Mage1.rpy"));
  });

  it("mode=files-all: lists all files", () => {
    const out = formatCopyReady(sampleArcs, "files-all");
    const lines = out.split("\n");
    assert.ok(lines.includes("game/tl/ru/MagePath/Mage1.rpy"));
    assert.ok(lines.includes("game/tl/ru/MagePath/Mage2.rpy"));
    assert.ok(lines.includes("game/tl/ru/SailorPath/Sailor1.rpy"));
    assert.ok(lines.includes("game/tl/ru/screens.rpy"));
    assert.equal(lines.length, 4);
  });

  it("mode=arcs-untranslated: lists incomplete arcs and root files", () => {
    const out = formatCopyReady(sampleArcs, "arcs-untranslated");
    const lines = out.split("\n");
    // MagePath has Mage2 with 0/10 => incomplete arc
    assert.ok(lines.includes("game/tl/ru/MagePath"));
    // SailorPath has 0/15 => incomplete arc
    assert.ok(lines.includes("game/tl/ru/SailorPath"));
    // screens.rpy is root, partial => listed directly
    assert.ok(lines.includes("game/tl/ru/screens.rpy"));
  });
});

// ─── Tests: integration with temp files ─────────────────────────

describe("analyzeContent integration", () => {
  it("reads from a temp .rpy and parses correctly", () => {
    const tmp = makeTempDir();
    try {
      const filePath = join(tmp.path, "test.rpy");
      writeFileSync(
        filePath,
        ["translate ru strings:", '    old "One"', '    new "One"', '    old "Two"', '    new "Два"', ""].join("\n"),
        "utf-8",
      );

      const content = readFileSync(filePath, "utf-8");
      const r = analyzeContent(content);
      assert.deepEqual(r, { total: 2, translated: 1 });
    } finally {
      tmp.cleanup();
    }
  });
});

// ─── Tests: formatStatus with real-world-like data ──────────────

describe("formatStatus multiple arcs", () => {
  const arcs = {
    Prologue: [
      { path: "game/tl/ru/Prologue/OpeningScene.rpy", stats: { total: 75, translated: 75 } },
      { path: "game/tl/ru/Prologue/OpeningSceneEvening.rpy", stats: { total: 42, translated: 42 } },
      { path: "game/tl/ru/Prologue/OpeningSceneFirstMorning.rpy", stats: { total: 120, translated: 120 } },
      { path: "game/tl/ru/Prologue/OpeningSceneSequence2.rpy", stats: { total: 4, translated: 4 } },
    ],
    LifeInRahayal: [
      { path: "game/tl/ru/LifeInRahayal/LifeInRahayal1.rpy", stats: { total: 177, translated: 0 } },
      { path: "game/tl/ru/LifeInRahayal/LifeInRahayal2.rpy", stats: { total: 105, translated: 0 } },
    ],
    VargaMarionPath: [{ path: "game/tl/ru/VargaMarionPath/MarionPath2.rpy", stats: { total: 890, translated: 0 } }],
    HollowWorld: [
      { path: "game/tl/ru/HollowWorld/TheHollowWorldWarrior6.rpy", stats: { total: 1049, translated: 0 } },
      { path: "game/tl/ru/HollowWorld/TheHollowWorldMage1.rpy", stats: { total: 131, translated: 131 } },
      { path: "game/tl/ru/HollowWorld/TheHollowWorldMage2.rpy", stats: { total: 114, translated: 114 } },
    ],
  };

  it("shows correct totals across arcs", () => {
    const out = formatStatus(arcs, false);
    assert.ok(out.includes("[DONE        ] Prologue/  (241/241 strings, 100.0%)"));
    assert.ok(out.includes("[NOT_STARTED ] LifeInRahayal/  (0/282 strings, 0.0%)"));
    assert.ok(out.includes("[NOT_STARTED ] VargaMarionPath/  (0/890 strings, 0.0%)"));
    assert.ok(out.includes("[PARTIAL     ] HollowWorld/  (245/1294 strings, 18.9%)"));
  });

  it("hides DONE files when showAll=false", () => {
    const out = formatStatus(arcs, false);
    assert.ok(!out.includes("OpeningScene.rpy"));
    assert.ok(!out.includes("OpeningSceneEvening.rpy"));
    assert.ok(out.includes("LifeInRahayal1.rpy"));
    assert.ok(out.includes("TheHollowWorldWarrior6.rpy"));
    assert.ok(!out.includes("TheHollowWorldMage1.rpy"));
  });

  it("shows DONE files when showAll=true", () => {
    const out = formatStatus(arcs, true);
    assert.ok(out.includes("OpeningScene.rpy"));
    assert.ok(out.includes("TheHollowWorldMage1.rpy"));
    assert.ok(out.includes("TheHollowWorldMage2.rpy"));
  });

  it("file count stats are correct", () => {
    const out = formatStatus(arcs, false);
    assert.ok(out.includes("Files: 4 (done=4, partial=0, empty=0)"));
    assert.ok(out.includes("Files: 2 (done=0, partial=2, empty=0)"));
    assert.ok(out.includes("Files: 1 (done=0, partial=1, empty=0)"));
    assert.ok(out.includes("Files: 3 (done=2, partial=1, empty=0)"));
  });
});

describe("formatCopyReady edge cases", () => {
  it("empty arcs produces empty output", () => {
    assert.equal(formatCopyReady({}, "arcs"), "");
    assert.equal(formatCopyReady({}, "files-all"), "");
    assert.equal(formatCopyReady({}, "files-untranslated"), "");
    assert.equal(formatCopyReady({}, "arcs-untranslated"), "");
  });

  it("only root files in arcs mode produces empty output", () => {
    const arcs = {
      __root__: [{ path: "game/tl/ru/screens.rpy", stats: { total: 100, translated: 50 } }],
    };
    assert.equal(formatCopyReady(arcs, "arcs"), "");
  });

  it("arcs-untranslated with all done arcs produces empty output", () => {
    const arcs = {
      Prologue: [{ path: "game/tl/ru/Prologue/Scene.rpy", stats: { total: 10, translated: 10 } }],
    };
    assert.equal(formatCopyReady(arcs, "arcs-untranslated"), "");
  });

  it("arcs-untranslated with zero total arc does not include it", () => {
    const arcs = {
      EmptyArc: [{ path: "game/tl/ru/EmptyArc/empty.rpy", stats: { total: 0, translated: 0 } }],
    };
    // total === 0 should be skipped (no strings at all)
    const out = formatCopyReady(arcs, "arcs-untranslated");
    assert.equal(out, "");
  });

  it("files-untranslated skips files with total=0", () => {
    const arcs = {
      EmptyArc: [{ path: "game/tl/ru/EmptyArc/empty.rpy", stats: { total: 0, translated: 0 } }],
    };
    assert.equal(formatCopyReady(arcs, "files-untranslated"), "");
  });
});
