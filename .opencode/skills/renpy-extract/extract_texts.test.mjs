/**
 * Tests for extract_texts.mjs v4
 * Practical tests that document and verify the extractor behavior.
 *
 * Требования:
 * - Node.js >= 18 (использует node:test, node:assert/strict)
 * - Никаких внешних зависимостей
 *
 * Запуск:
 *   node --test extract_texts.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  RenPyExtractor,
  generateRpy,
  generateEngineRpy,
  countEngineTranslations,
  _findRenpyCommonDir,
  _hash,
  _esc,
  _unescape,
  VERSION,
  ARC_PATTERNS,
} from "./extract_texts.mjs";

// ─── Helpers ──────────────────────────────────────────────────

function makeTempDir(prefix = "ext-test-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    path: dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// ─── Fixtures ─────────────────────────────────────────────────

function sampleScript(basePath) {
  const gameDir = join(basePath, "test_game");
  mkdirSync(gameDir, { recursive: true });
  const content = [
    'define config.name = _("The Survival Game")',
    "",
    "label start:",
    '    "This is a narration line."',
    '    s "Hello, my name is Sarah."',
    '    "Another narration."',
    "",
    "menu my_menu:",
    '    "Yes":',
    "        pass",
    '    "No":',
    "        pass",
    "",
    "label another_scene:",
    '    ko "King speaking."',
    '    ko "Another line from king."',
  ].join("\n");
  writeFileSync(join(gameDir, "script.rpy"), content, "utf-8");
  return gameDir;
}

function dupScript(basePath) {
  const gameDir = join(basePath, "test_game");
  mkdirSync(gameDir, { recursive: true });
  const content = [
    'define s = Character(_("Sarah"), who_color="#daa520")',
    'define ko = Character(_("King Orwell"), who_color="#ff6347")',
    "",
    "label start:",
    '    "This line appears once."',
    '    "This line appears once."',
    '    s "Dialogue A"',
    '    s "Dialogue A"',
    '    "This line appears once."',
    "",
    "label second:",
    '    "This line appears once."',
  ].join("\n");
  writeFileSync(join(gameDir, "script.rpy"), content, "utf-8");
  return gameDir;
}

function multiFileScript(basePath) {
  const gameDir = join(basePath, "test_game");
  mkdirSync(gameDir, { recursive: true });
  const subdir = join(gameDir, "subdir");
  mkdirSync(subdir, { recursive: true });
  writeFileSync(
    join(gameDir, "script.rpy"),
    ["label start:", '    "Shared narration line."', '    s "Hello"'].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(subdir, "quest1.rpy"),
    ["label quest1:", '    "Shared narration line."', '    s "Hello"', '    "Unique to quest."'].join("\n"),
    "utf-8",
  );
  return gameDir;
}

function quotedDialogueScript(basePath) {
  const gameDir = join(basePath, "test_game");
  mkdirSync(gameDir, { recursive: true });
  writeFileSync(
    join(gameDir, "script.rpy"),
    [
      "label start:",
      '    "Raza" "Good. Good."',
      '    "Raza" "They call me Raza."',
      '    "This is narration without character."',
      '    "Raza" "No. Not now."',
      '    s "Hello from defined character."',
      '    "Guard Captain" "There she goes!"',
    ].join("\n"),
    "utf-8",
  );
  return gameDir;
}

// ─── Tests: Extraction Basics ─────────────────────────────────

describe("TestExtractionBasics", () => {
  it("test narration extraction", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = sampleScript(tmp.path);
      const ext = new RenPyExtractor(gameDir);
      ext.parseFile(join(gameDir, "script.rpy"));

      const arcBlocks = Object.values(ext.arcs).reduce(
        (sum, scenes) => sum + Object.values(scenes).reduce((s, scene) => s + Object.keys(scene.blocks).length, 0),
        0,
      );
      assert.ok(arcBlocks >= 4);
    } finally {
      tmp.cleanup();
    }
  });

  it("test dialogue extraction", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = sampleScript(tmp.path);
      const ext = new RenPyExtractor(gameDir);
      ext.parseFile(join(gameDir, "script.rpy"));

      let found = false;
      for (const arc of Object.values(ext.arcs)) {
        for (const scene of Object.values(arc)) {
          for (const bd of Object.values(scene.blocks)) {
            if (bd.original.includes("Hello, my name is Sarah")) {
              found = true;
              assert.equal(bd.type, "dialogue");
              assert.equal(bd.character, "s");
            }
          }
        }
      }
      assert.ok(found, "Dialogue line not found");
    } finally {
      tmp.cleanup();
    }
  });

  it("test menu choice included", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = sampleScript(tmp.path);
      const ext = new RenPyExtractor(gameDir);
      ext.parseFile(join(gameDir, "script.rpy"));

      const arcBlocks = Object.values(ext.arcs).reduce(
        (sum, scenes) => sum + Object.values(scenes).reduce((s, scene) => s + Object.keys(scene.blocks).length, 0),
        0,
      );
      assert.ok(arcBlocks >= 2);
    } finally {
      tmp.cleanup();
    }
  });

  it("test character name extraction", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = join(tmp.path, "test_game");
      mkdirSync(gameDir, { recursive: true });
      writeFileSync(join(gameDir, "script.rpy"), 'define s = Character(_("Sarah"), who_color="#daa520")\n', "utf-8");

      const ext = new RenPyExtractor(gameDir);
      ext.parseFile(join(gameDir, "script.rpy"));

      assert.equal(Object.keys(ext.characterBlocks).length, 1);
      const block = Object.values(ext.characterBlocks)[0];
      assert.equal(block.original, "Sarah");
      assert.equal(block.type, "character_name");
    } finally {
      tmp.cleanup();
    }
  });

  it("test character name plain", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = join(tmp.path, "test_game");
      mkdirSync(gameDir, { recursive: true });
      writeFileSync(join(gameDir, "script.rpy"), 'define s = Character("Sarah")\n', "utf-8");

      const ext = new RenPyExtractor(gameDir);
      ext.parseFile(join(gameDir, "script.rpy"));

      assert.equal(Object.keys(ext.characterBlocks).length, 1);
      const block = Object.values(ext.characterBlocks)[0];
      assert.equal(block.original, "Sarah");
      assert.equal(block.type, "character_name");
    } finally {
      tmp.cleanup();
    }
  });

  it("test define extraction", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = join(tmp.path, "test_game");
      mkdirSync(gameDir, { recursive: true });
      writeFileSync(join(gameDir, "script.rpy"), 'define config.name = _("My Game Name")\n', "utf-8");

      const ext = new RenPyExtractor(gameDir);
      ext.parseFile(join(gameDir, "script.rpy"));

      assert.equal(Object.keys(ext.defineBlocks).length, 1);
      const block = Object.values(ext.defineBlocks)[0];
      assert.equal(block.original, "My Game Name");
    } finally {
      tmp.cleanup();
    }
  });
});

// ─── Tests: Deduplication ─────────────────────────────────────

describe("TestDeduplication", () => {
  it("duplicate narration same scene deduped", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = dupScript(tmp.path);
      const ext = new RenPyExtractor(gameDir);
      ext.parseFile(join(gameDir, "script.rpy"));

      const seen = new Set();
      for (const arc of Object.values(ext.arcs)) {
        for (const scene of Object.values(arc)) {
          for (const bd of Object.values(scene.blocks)) {
            assert.ok(!seen.has(bd.original), `Duplicate: ${bd.original}`);
            seen.add(bd.original);
          }
        }
      }

      let count = 0;
      for (const arc of Object.values(ext.arcs)) {
        for (const scene of Object.values(arc)) {
          for (const bd of Object.values(scene.blocks)) {
            if (bd.original === "This line appears once.") count++;
          }
        }
      }
      assert.equal(count, 1);
    } finally {
      tmp.cleanup();
    }
  });

  it("duplicate dialogue same scene deduped", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = dupScript(tmp.path);
      const ext = new RenPyExtractor(gameDir);
      ext.parseFile(join(gameDir, "script.rpy"));

      let count = 0;
      for (const arc of Object.values(ext.arcs)) {
        for (const scene of Object.values(arc)) {
          for (const bd of Object.values(scene.blocks)) {
            if (bd.original === "Dialogue A") count++;
          }
        }
      }
      assert.equal(count, 1);
    } finally {
      tmp.cleanup();
    }
  });

  it("duplicate across scenes deduped", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = dupScript(tmp.path);
      const ext = new RenPyExtractor(gameDir);
      ext.parseFile(join(gameDir, "script.rpy"));

      let count = 0;
      for (const arc of Object.values(ext.arcs)) {
        for (const scene of Object.values(arc)) {
          for (const bd of Object.values(scene.blocks)) {
            if (bd.original === "This line appears once.") count++;
          }
        }
      }
      assert.equal(count, 1);
    } finally {
      tmp.cleanup();
    }
  });

  it("duplicate across files deduped", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = multiFileScript(tmp.path);
      const ext = new RenPyExtractor(gameDir);
      ext.scan();

      let count = 0;
      for (const arc of Object.values(ext.arcs)) {
        for (const scene of Object.values(arc)) {
          for (const bd of Object.values(scene.blocks)) {
            if (bd.original === "Shared narration line.") count++;
          }
        }
      }
      assert.equal(count, 1);
    } finally {
      tmp.cleanup();
    }
  });
});

// ─── Tests: Arc Organization ──────────────────────────────────

describe("TestArcOrganization", () => {
  it("test prologue arc exists", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = sampleScript(tmp.path);
      const ext = new RenPyExtractor(gameDir);
      ext.scan();

      assert.ok("Prologue" in ext.arcs || "Other" in ext.arcs);
    } finally {
      tmp.cleanup();
    }
  });

  it("test start scene exists", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = sampleScript(tmp.path);
      const ext = new RenPyExtractor(gameDir);
      ext.scan();

      let found = false;
      for (const arc of Object.values(ext.arcs)) {
        if ("start" in arc) found = true;
      }
      assert.ok(found, "Scene 'start' not found in any arc");
    } finally {
      tmp.cleanup();
    }
  });
});

// ─── Tests: Translation Preservation ──────────────────────────

describe("TestTranslationPreservation", () => {
  it("load existing translations", () => {
    const tmp = makeTempDir();
    try {
      const screens = join(tmp.path, "tl", "ru", "screens.rpy");
      mkdirSync(join(screens, ".."), { recursive: true });
      writeFileSync(screens, ["translate ru strings:", '    old "Hello"', '    new "Привет"', ""].join("\n"), "utf-8");

      const gameDir = join(tmp.path, "game");
      mkdirSync(gameDir, { recursive: true });
      writeFileSync(join(gameDir, "script.rpy"), 'label start:\n    "Hello"\n', "utf-8");

      const ext = new RenPyExtractor(gameDir);
      ext.setExistingTranslations(join(tmp.path, "tl", "ru"));
      ext.scan();

      let found = null;
      for (const arc of Object.values(ext.arcs)) {
        for (const scene of Object.values(arc)) {
          for (const bd of Object.values(scene.blocks)) {
            if (bd.original === "Hello") found = bd;
          }
        }
      }

      assert.ok(found !== null);
      assert.equal(found.translated, "Привет");
    } finally {
      tmp.cleanup();
    }
  });

  it("new string empty translation", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = join(tmp.path, "game");
      mkdirSync(gameDir, { recursive: true });
      writeFileSync(join(gameDir, "script.rpy"), 'label start:\n    "New string"\n', "utf-8");

      const ext = new RenPyExtractor(gameDir);
      ext.scan();

      let found = null;
      for (const arc of Object.values(ext.arcs)) {
        for (const scene of Object.values(arc)) {
          for (const bd of Object.values(scene.blocks)) {
            if (bd.original === "New string") found = bd;
          }
        }
      }

      assert.ok(found !== null);
      assert.equal(found.translated, "");
    } finally {
      tmp.cleanup();
    }
  });
});

// ─── Tests: generateRpy ───────────────────────────────────────

describe("TestGenerateRPY", () => {
  it("rpy format no translation uses original as fallback", () => {
    const tmp = makeTempDir();
    try {
      const data = {
        meta: {
          version: 4,
          extractedAt: "",
          totalArcBlocks: 1,
          totalUiStrings: 0,
          totalCharacterNames: 0,
          totalDefineStrings: 0,
          arcsCount: 1,
        },
        arcs: {
          Prologue: {
            start: {
              sourceFile: "script.rpy",
              sourceLine: 0,
              blocks: {
                test_narration: {
                  id: "start_abc123",
                  original: "Hello world",
                  translated: "",
                  type: "narration",
                  character: null,
                  sourceFile: "script.rpy",
                  sourceLine: 1,
                },
              },
            },
          },
        },
        uiByFile: {},
        charactersByFile: {},
        definesByFile: {},
      };

      const outDir = join(tmp.path, "tl", "ru");
      generateRpy(data, outDir);

      const resultFile = join(outDir, "Prologue", "start.rpy");
      assert.ok(existsSync(resultFile));

      const content = readFileSync(resultFile, "utf-8");
      assert.ok(content.includes("translate ru strings:"));
      assert.ok(content.includes('old "Hello world"'));
      assert.ok(content.includes('new "Hello world"'));
    } finally {
      tmp.cleanup();
    }
  });

  it("rpy format with translation", () => {
    const tmp = makeTempDir();
    try {
      const data = {
        meta: {
          version: 4,
          extractedAt: "",
          totalArcBlocks: 1,
          totalUiStrings: 0,
          totalCharacterNames: 0,
          totalDefineStrings: 0,
          arcsCount: 1,
        },
        arcs: {
          Prologue: {
            start: {
              sourceFile: "script.rpy",
              sourceLine: 0,
              blocks: {
                test_narration: {
                  id: "start_abc123",
                  original: "Hello world",
                  translated: "Привет мир",
                  type: "narration",
                  character: null,
                  sourceFile: "script.rpy",
                  sourceLine: 1,
                },
              },
            },
          },
        },
        uiByFile: {},
        charactersByFile: {},
        definesByFile: {},
      };

      const outDir = join(tmp.path, "tl", "ru");
      generateRpy(data, outDir);

      const content = readFileSync(join(outDir, "Prologue", "start.rpy"), "utf-8");
      assert.ok(content.includes('old "Hello world"'));
      assert.ok(content.includes('new "Привет мир"'));
    } finally {
      tmp.cleanup();
    }
  });

  it("screens rpy format", () => {
    const tmp = makeTempDir();
    try {
      const data = {
        meta: {
          version: 4,
          extractedAt: "",
          totalArcBlocks: 0,
          totalUiStrings: 1,
          totalCharacterNames: 0,
          totalDefineStrings: 0,
          arcsCount: 0,
        },
        arcs: {},
        uiByFile: {
          "screens.rpy": [
            {
              id: "ui_abc123",
              original: "Start",
              translated: "Начать",
              type: "ui_string",
              character: null,
              sourceFile: "screens.rpy",
              sourceLine: 10,
            },
          ],
        },
        charactersByFile: {},
        definesByFile: {},
      };

      const outDir = join(tmp.path, "tl", "ru");
      generateRpy(data, outDir);

      const content = readFileSync(join(outDir, "screens.rpy"), "utf-8");
      assert.ok(content.includes("translate ru strings:"));
      assert.ok(content.includes('old "Start"'));
      assert.ok(content.includes('new "Начать"'));
    } finally {
      tmp.cleanup();
    }
  });

  it("misc strings format", () => {
    const tmp = makeTempDir();
    try {
      const data = {
        meta: {
          version: 4,
          extractedAt: "",
          totalArcBlocks: 0,
          totalUiStrings: 0,
          totalCharacterNames: 1,
          totalDefineStrings: 0,
          arcsCount: 0,
        },
        arcs: {},
        uiByFile: {},
        charactersByFile: {
          "script.rpy": [
            {
              id: "char_abc123",
              original: "Sarah",
              translated: "Сара",
              type: "character_name",
              character: null,
              sourceFile: "script.rpy",
              sourceLine: 5,
            },
          ],
        },
        definesByFile: {},
      };

      const outDir = join(tmp.path, "tl", "ru");
      generateRpy(data, outDir);

      const content = readFileSync(join(outDir, "misc_strings.rpy"), "utf-8");
      assert.ok(content.includes('old "Sarah"'));
      assert.ok(content.includes('new "Сара"'));
    } finally {
      tmp.cleanup();
    }
  });

  it("existing translations loaded", () => {
    const tmp = makeTempDir();
    try {
      const outDir = join(tmp.path, "tl", "ru");
      const data = {
        meta: {
          version: 4,
          extractedAt: "",
          totalArcBlocks: 1,
          totalUiStrings: 0,
          totalCharacterNames: 0,
          totalDefineStrings: 0,
          arcsCount: 1,
        },
        arcs: {
          Prologue: {
            start: {
              sourceFile: "script.rpy",
              sourceLine: 0,
              blocks: {
                nar1: {
                  id: "start_abc",
                  original: "Test string",
                  translated: "Перевод",
                  type: "narration",
                  character: null,
                  sourceFile: "script.rpy",
                  sourceLine: 1,
                },
              },
            },
          },
        },
        uiByFile: {},
        charactersByFile: {},
        definesByFile: {},
      };
      generateRpy(data, outDir);

      const gameDir = join(tmp.path, "game");
      mkdirSync(gameDir, { recursive: true });
      writeFileSync(join(gameDir, "script.rpy"), 'label start:\n    "Test string"\n', "utf-8");

      const ext = new RenPyExtractor(gameDir);
      ext.setExistingTranslations(outDir);
      assert.ok("Test string" in ext._existingTranslations);
    } finally {
      tmp.cleanup();
    }
  });
});

// ─── Full Pipeline ────────────────────────────────────────────

describe("TestFullPipeline", () => {
  it("roundtrip extract generate load", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = join(tmp.path, "game");
      mkdirSync(gameDir, { recursive: true });
      writeFileSync(
        join(gameDir, "script.rpy"),
        [
          "label start:",
          '    "Intro narration."',
          '    s "Hello!"',
          "",
          "menu test:",
          '    "Option 1":',
          "        pass",
          '    "Option 2":',
          "        pass",
        ].join("\n"),
        "utf-8",
      );
      writeFileSync(join(gameDir, "screens.rpy"), 'textbutton _("Start") action Start()\n', "utf-8");

      const tlDir = join(tmp.path, "tl", "ru");
      const ext = new RenPyExtractor(gameDir);
      const data = ext.scan();

      assert.ok("Other" in data.arcs);
      assert.ok(Object.keys(ext.uiBlocks).length >= 1);

      generateRpy(data, tlDir);

      const startFile = join(tlDir, "Other", "start.rpy");
      assert.ok(existsSync(startFile));
      const content = readFileSync(startFile, "utf-8");
      assert.ok(content.includes("translate ru strings:"));
      assert.ok(content.includes('old "Intro narration."'));
      assert.ok(content.includes('new "Intro narration."'));

      const ext2 = new RenPyExtractor(gameDir);
      ext2.setExistingTranslations(tlDir);
      assert.equal(Object.keys(ext2._existingTranslations).length, 0);
    } finally {
      tmp.cleanup();
    }
  });

  it("no dedup across arcs", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = join(tmp.path, "game");
      mkdirSync(gameDir, { recursive: true });
      writeFileSync(
        join(gameDir, "script.rpy"),
        ["label scene1:", '    "Unique to scene1."', "", "label scene2:", '    "Unique to scene2."'].join("\n"),
        "utf-8",
      );

      const ext = new RenPyExtractor(gameDir);
      const data = ext.scan();

      let total = 0;
      for (const arc of Object.values(data.arcs)) {
        for (const scene of Object.values(arc)) {
          total += Object.keys(scene.blocks).length;
        }
      }
      assert.equal(total, 2);
    } finally {
      tmp.cleanup();
    }
  });
});

// ─── Quoted Dialogue Tests ────────────────────────────────────

describe("TestQuotedDialogue", () => {
  it("quoted dialogue not narration", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = quotedDialogueScript(tmp.path);
      const ext = new RenPyExtractor(gameDir);
      ext.parseFile(join(gameDir, "script.rpy"));

      const razaLines = [];
      const narrationLines = [];

      for (const arc of Object.values(ext.arcs)) {
        for (const scene of Object.values(arc)) {
          for (const bd of Object.values(scene.blocks)) {
            const orig = bd.original || "";
            if (
              orig.includes("Raza") ||
              orig === "Good. Good." ||
              orig === "They call me Raza" ||
              orig === "No. Not now"
            ) {
              razaLines.push(bd);
            }
            if (bd.type === "narration") {
              narrationLines.push(bd);
            }
          }
        }
      }

      for (const bd of razaLines) {
        assert.equal(bd.type, "dialogue", `Expected dialogue, got ${bd.type}: ${bd.original}`);
      }

      assert.equal(narrationLines.length, 1);
      assert.equal(narrationLines[0].original, "This is narration without character.");
    } finally {
      tmp.cleanup();
    }
  });

  it("quoted dialogue text without character", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = quotedDialogueScript(tmp.path);
      const ext = new RenPyExtractor(gameDir);
      ext.parseFile(join(gameDir, "script.rpy"));

      for (const arc of Object.values(ext.arcs)) {
        for (const scene of Object.values(arc)) {
          for (const bd of Object.values(scene.blocks)) {
            if (bd.type === "dialogue") {
              assert.ok(!bd.original.includes('\\"'), `Dialogue has escaped quotes: ${bd.original}`);
              assert.ok(!bd.original.startsWith("Raza"), `Dialogue starts with character name: ${bd.original}`);
            }
          }
        }
      }
    } finally {
      tmp.cleanup();
    }
  });

  it("quoted dialogue character name extraction", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = quotedDialogueScript(tmp.path);
      const ext = new RenPyExtractor(gameDir);
      ext.parseFile(join(gameDir, "script.rpy"));

      const razaLines = [];
      for (const arc of Object.values(ext.arcs)) {
        for (const scene of Object.values(arc)) {
          for (const bd of Object.values(scene.blocks)) {
            if (bd.character === "Raza") razaLines.push(bd);
          }
        }
      }

      assert.equal(razaLines.length, 3);
      for (const bd of razaLines) {
        assert.equal(bd.type, "dialogue");
      }

      assert.ok("Raza" in ext.characterBlocks);
      assert.equal(ext.characterBlocks["Raza"].type, "character_name");
      assert.ok(!("s" in ext.characterBlocks));

      // Guard Captain
      let gcLines = [];
      for (const arc of Object.values(ext.arcs)) {
        for (const scene of Object.values(arc)) {
          for (const bd of Object.values(scene.blocks)) {
            if (bd.character === "Guard Captain") gcLines.push(bd);
          }
        }
      }
      assert.equal(gcLines.length, 1);
      assert.equal(gcLines[0].original, "There she goes!");
      assert.ok("Guard Captain" in ext.characterBlocks);
    } finally {
      tmp.cleanup();
    }
  });

  it("generated rpy no combined format", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = quotedDialogueScript(tmp.path);
      const ext = new RenPyExtractor(gameDir);
      ext.parseFile(join(gameDir, "script.rpy"));
      const data = ext.scan();

      const outDir = join(tmp.path, "tl", "ru");
      generateRpy(data, outDir);

      function walk(dir) {
        let entries;
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isFile() && entry.name.endsWith(".rpy")) {
            const content = readFileSync(fullPath, "utf-8");
            for (const line of content.split("\n")) {
              const s = line.trim();
              if (s.startsWith("old ")) {
                assert.ok(!s.includes('Raza\\" \\"'), `Combined format found: ${s}`);
                assert.ok(!s.includes('\\" \\"'), `Escaped quote pair in old: ${s}`);
              }
            }
          } else if (entry.isDirectory()) {
            walk(fullPath);
          }
        }
      }
      walk(outDir);
    } finally {
      tmp.cleanup();
    }
  });

  it("generated rpy has split format", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = quotedDialogueScript(tmp.path);
      const ext = new RenPyExtractor(gameDir);
      ext.parseFile(join(gameDir, "script.rpy"));
      const data = ext.scan();

      const outDir = join(tmp.path, "tl", "ru");
      generateRpy(data, outDir);

      let foundGood = false;
      function walk(dir) {
        let entries;
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isFile() && entry.name.endsWith(".rpy")) {
            const content = readFileSync(fullPath, "utf-8");
            if (content.includes("Good. Good.")) {
              foundGood = true;
              assert.ok(content.includes('old "Good. Good."'));
            }
          } else if (entry.isDirectory()) {
            walk(fullPath);
          }
        }
      }
      walk(outDir);
      assert.ok(foundGood, "Dialogue 'Good. Good.' not found in generated output");
    } finally {
      tmp.cleanup();
    }
  });
});

// ─── Utility Tests ────────────────────────────────────────────

describe("TestUtilities", () => {
  it("hash consistency", () => {
    assert.equal(_hash("test"), _hash("test"));
  });

  it("esc quotes", () => {
    assert.equal(_esc('He said "hello"'), 'He said \\"hello\\"');
  });

  it("esc backslash", () => {
    assert.equal(_esc("path\\to\\file"), "path\\\\to\\\\file");
  });

  it("unescape", () => {
    assert.equal(_unescape('Say \\"hello\\"'), 'Say "hello"');
    assert.equal(_unescape("back\\\\slash"), "back\\slash");
    assert.equal(_unescape('\\\\\\"'), '\\"');
  });
});

// ─── Escaped Quotes Roundtrip ─────────────────────────────────

describe("TestEscapedQuotesRoundtrip", () => {
  it("narration with escaped quotes", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = join(tmp.path, "test_game");
      mkdirSync(gameDir, { recursive: true });
      writeFileSync(
        join(gameDir, "script.rpy"),
        ["label start:", '  "She said \\"hello\\" to me."'].join("\n"),
        "utf-8",
      );

      const ext = new RenPyExtractor(gameDir);
      ext.parseFile(join(gameDir, "script.rpy"));
      const data = ext.scan();

      const outDir = join(tmp.path, "tl", "ru");
      generateRpy(data, outDir);

      function walk(dir) {
        let entries;
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          return [];
        }
        const files = [];
        for (const e of entries) {
          const fp = join(dir, e.name);
          if (e.isFile() && e.name.endsWith(".rpy")) files.push(fp);
          else if (e.isDirectory()) files.push(...walk(fp));
        }
        return files;
      }

      const generated = walk(outDir);
      assert.ok(generated.length > 0, "No files generated");
      const genContent = readFileSync(generated[0], "utf-8");
      assert.ok(genContent.includes('old "She said \\"hello\\" to me."'), `Wrong escaping: ${genContent}`);
    } finally {
      tmp.cleanup();
    }
  });

  it("unescape preserves text meaning", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = join(tmp.path, "test_game");
      mkdirSync(gameDir, { recursive: true });
      writeFileSync(
        join(gameDir, "script.rpy"),
        ["label start:", '  "The title reads: \\"A Tale of Two Cities\\"."'].join("\n"),
        "utf-8",
      );

      const ext = new RenPyExtractor(gameDir);
      ext.parseFile(join(gameDir, "script.rpy"));

      let found = false;
      for (const arc of Object.values(ext.arcs)) {
        for (const scene of Object.values(arc)) {
          for (const bd of Object.values(scene.blocks)) {
            if (bd.original.includes("A Tale of Two Cities")) {
              found = true;
              assert.ok(!bd.original.includes('\\"'), `Still has escaped quotes: ${bd.original}`);
              assert.ok(bd.original.includes('"'), `Should have plain quotes: ${bd.original}`);
            }
          }
        }
      }
      assert.ok(found, "Extracted text not found");
    } finally {
      tmp.cleanup();
    }
  });
});

// ─── Engine Builtins Tests ────────────────────────────────────

describe("TestEngineBuiltins", () => {
  it("scan engine builtins finds strings", () => {
    const tmp = makeTempDir();
    try {
      const commonDir = join(tmp.path, "renpy", "common");
      mkdirSync(commonDir, { recursive: true });
      writeFileSync(
        join(commonDir, "00gui.rpy"),
        [
          "init python:",
          "    class gui:",
          '        QUIT = _("Are you sure you want to quit?")',
          '        DELETE = _("Are you sure you want to delete this save?")',
        ].join("\n"),
        "utf-8",
      );
      writeFileSync(
        join(commonDir, "00layout.rpy"),
        ["init python:", '    layout.QUIT = _("Are you sure you want to quit?")'].join("\n"),
        "utf-8",
      );

      const gameDir = join(tmp.path, "game");
      mkdirSync(gameDir, { recursive: true });
      writeFileSync(join(gameDir, "script.rpy"), 'label start:\n    "Hello"\n', "utf-8");

      const ext = new RenPyExtractor(gameDir);
      const blocks = ext.scanEngineBuiltins(commonDir);

      assert.equal(blocks.length, 2);
      const texts = new Set(blocks.map((b) => b.original));
      assert.ok(texts.has("Are you sure you want to quit?"));
      assert.ok(texts.has("Are you sure you want to delete this save?"));
    } finally {
      tmp.cleanup();
    }
  });

  it("scan respects seen originals", () => {
    const tmp = makeTempDir();
    try {
      const commonDir = join(tmp.path, "renpy", "common");
      mkdirSync(commonDir, { recursive: true });
      writeFileSync(join(commonDir, "00gui.rpy"), ["init python:", '    QUIT = _("Hello")'].join("\n"), "utf-8");

      const gameDir = join(tmp.path, "game");
      mkdirSync(gameDir, { recursive: true });
      writeFileSync(join(gameDir, "script.rpy"), 'label start:\n    "Hello"\n', "utf-8");

      const ext = new RenPyExtractor(gameDir);
      ext.parseFile(join(gameDir, "script.rpy"));
      const blocks = ext.scanEngineBuiltins(commonDir);

      assert.equal(blocks.length, 0);
    } finally {
      tmp.cleanup();
    }
  });

  it("generate engine rpy creates file", () => {
    const tmp = makeTempDir();
    try {
      const blocks = [
        {
          id: "engine_abc",
          original: "Are you sure you want to quit?",
          translated: "",
          type: "engine_string",
          sourceFile: "renpy/common/00gui.rpy",
          sourceLine: 42,
        },
        {
          id: "engine_def",
          original: "Are you sure?",
          translated: "",
          type: "engine_string",
          sourceFile: "renpy/common/00gui.rpy",
          sourceLine: 40,
        },
      ];

      const tlDir = join(tmp.path, "tl", "ru");
      mkdirSync(tlDir, { recursive: true });

      const generated = generateEngineRpy(blocks, tlDir);
      assert.deepEqual(generated, ["renpy_common.rpy"]);

      const result = join(tlDir, "renpy_common.rpy");
      assert.ok(existsSync(result));
      const content = readFileSync(result, "utf-8");
      assert.ok(content.includes("translate ru strings:"));
      assert.ok(content.includes('old "Are you sure you want to quit?"'));
      assert.ok(content.includes('new "Are you sure you want to quit?"'));
      assert.ok(content.includes('old "Are you sure?"'));
      assert.ok(content.includes('new "Are you sure?"'));
    } finally {
      tmp.cleanup();
    }
  });

  it("generate engine rpy preserves existing", () => {
    const tmp = makeTempDir();
    try {
      const tlDir = join(tmp.path, "tl", "ru");
      mkdirSync(tlDir, { recursive: true });
      const old = join(tlDir, "renpy_common.rpy");
      writeFileSync(
        old,
        [
          "translate ru strings:",
          '    old "Are you sure you want to quit?"',
          '    new "Вы уверены, что хотите выйти?"',
          "",
        ].join("\n"),
        "utf-8",
      );

      const blocks = [
        {
          id: "engine_abc",
          original: "Are you sure you want to quit?",
          translated: "",
          type: "engine_string",
          sourceFile: "renpy/common/00gui.rpy",
          sourceLine: 42,
        },
      ];

      generateEngineRpy(blocks, tlDir);
      const content = readFileSync(join(tlDir, "renpy_common.rpy"), "utf-8");
      assert.ok(content.includes('new "Вы уверены, что хотите выйти?"'));
    } finally {
      tmp.cleanup();
    }
  });

  it("count engine translations", () => {
    const tmp = makeTempDir();
    try {
      const tlDir = join(tmp.path, "tl", "ru");
      mkdirSync(tlDir, { recursive: true });
      writeFileSync(
        join(tlDir, "renpy_common.rpy"),
        [
          "translate ru strings:",
          '    old "String one"',
          '    new "Строка один"',
          "",
          '    old "String two"',
          '    new "String two"',
          "",
          '    old "String three"',
          '    new "Строка три"',
          "",
        ].join("\n"),
        "utf-8",
      );

      const [total, done] = countEngineTranslations(tlDir);
      assert.equal(total, 3);
      assert.equal(done, 2);
    } finally {
      tmp.cleanup();
    }
  });

  it("count no file returns 0,0", () => {
    const tmp = makeTempDir();
    try {
      const tlDir = join(tmp.path, "tl", "ru");
      const [total, done] = countEngineTranslations(tlDir);
      assert.equal(total, 0);
      assert.equal(done, 0);
    } finally {
      tmp.cleanup();
    }
  });
});
