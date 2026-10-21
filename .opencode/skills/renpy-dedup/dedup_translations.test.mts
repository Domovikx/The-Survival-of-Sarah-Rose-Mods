/**
 * Tests for dedup_translations.mts
 * =================================
 * Проверяем поиск и удаление дублирующихся old строк.
 *
 * Требования:
 * - Node.js >= 18 (использует node:test, node:assert/strict)
 * - Никаких внешних зависимостей
 *
 * Запуск:
 *   node --test dedup_translations.test.mts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  parseTranslateBlocks,
  findAllEntries,
  findDuplicates,
  deduplicate,
  OLD_RE,
  NEW_RE,
  VERSION,
} from "./dedup_translations.mts";

const SAMPLE_RPY = [
  "# -*- encoding: utf-8 -*-",
  "# Arc: Test",
  "",
  "translate ru strings:",
  "",
  '    old "Raza"',
  '    new "Раза"',
  "",
  '    old "Hello world"',
  '    new "Привет мир"',
  "",
  '    old "How are you?"',
  '    new "Как дела?"',
  "",
].join("\n");

const SAMPLE_RPY2 = [
  "# -*- encoding: utf-8 -*-",
  "# Arc: Test2",
  "",
  "translate ru strings:",
  "",
  '    old "Raza"',
  '    new "Раза"',
  "",
  '    old "Goodbye"',
  '    new "Пока"',
  "",
  '    old "Hello world"',
  '    new "Привет мир"',
  "",
  '    old "Something else"',
  '    new "Что-то другое"',
  "",
].join("\n");

const SAMPLE_NO_TRANSLATE = ["# -*- encoding: utf-8 -*-", "label start:", '    "Hello"', "    return", ""].join("\n");

const SAMPLE_MULTIPLE_BLOCKS = [
  "translate ru strings:",
  "",
  '    old "One"',
  '    new "Один"',
  "",
  "translate ru strings:",
  "",
  '    old "Two"',
  '    new "Два"',
  "",
].join("\n");

/** Описание временной директории. */
interface TempDir {
  path: string;
  cleanup: () => void;
}

/**
 * Создаёт временную структуру game/tl/ru/ с тестовыми .rpy файлами.
 * @param {string} basePath
 * @returns {string} путь к tl/ru/
 */
function createTlDir(basePath: string): string {
  const tlRu = join(basePath, "game", "tl", "ru");
  mkdirSync(tlRu, { recursive: true });
  writeFileSync(join(tlRu, "file1.rpy"), SAMPLE_RPY, "utf-8");
  writeFileSync(join(tlRu, "file2.rpy"), SAMPLE_RPY2, "utf-8");
  return tlRu;
}

/**
 * @param {string} prefix
 * @returns {{ path: string, cleanup: () => void }}
 */
function makeTempDir(prefix = "dedup-test-"): TempDir {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    path: dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// ─── Tests: parseTranslateBlocks ────────────────────────────────

describe("parseTranslateBlocks", () => {
  it("parses simple blocks", () => {
    const pairs = parseTranslateBlocks(SAMPLE_RPY);
    assert.equal(pairs.length, 3);
    assert.equal(pairs[0][1], "Raza");
    assert.equal(pairs[0][2], "Раза");
    assert.equal(pairs[1][1], "Hello world");
    assert.equal(pairs[1][2], "Привет мир");
    assert.equal(pairs[2][1], "How are you?");
    assert.equal(pairs[2][2], "Как дела?");
  });

  it("handles no translate block", () => {
    const pairs = parseTranslateBlocks(SAMPLE_NO_TRANSLATE);
    assert.equal(pairs.length, 0);
  });

  it("handles multiple translate blocks", () => {
    const pairs = parseTranslateBlocks(SAMPLE_MULTIPLE_BLOCKS);
    assert.equal(pairs.length, 2);
    assert.equal(pairs[0][1], "One");
    assert.equal(pairs[1][1], "Two");
  });

  it("handles empty string", () => {
    const pairs = parseTranslateBlocks("");
    assert.equal(pairs.length, 0);
  });
});

// ─── Tests: findAllEntries ─────────────────────────────────────

describe("findAllEntries", () => {
  it("finds all entries in tl dir", () => {
    const tmp = makeTempDir();
    try {
      const tlRu = createTlDir(tmp.path);
      const entries = findAllEntries(tlRu);
      assert.equal(entries.length, 7);
    } finally {
      tmp.cleanup();
    }
  });

  it("returns correct entry structure", () => {
    const tmp = makeTempDir();
    try {
      const tlRu = createTlDir(tmp.path);
      const entries = findAllEntries(tlRu);
      const entry = entries[0];
      assert.ok("file" in entry);
      assert.ok("line" in entry);
      assert.ok("old" in entry);
      assert.ok("new" in entry);
      assert.equal(typeof entry.file, "string");
    } finally {
      tmp.cleanup();
    }
  });

  it("returns empty for empty dir", () => {
    const tmp = makeTempDir();
    try {
      const entries = findAllEntries(tmp.path);
      assert.equal(entries.length, 0);
    } finally {
      tmp.cleanup();
    }
  });

  it("sorts entries by file and line", () => {
    const tmp = makeTempDir();
    try {
      const tlRu = createTlDir(tmp.path);
      const entries = findAllEntries(tlRu);
      const file1Entries = entries.filter((e) => e.file.includes("file1.rpy"));
      const file2Entries = entries.filter((e) => e.file.includes("file2.rpy"));
      assert.equal(file1Entries.length, 3);
      assert.equal(file2Entries.length, 4);
    } finally {
      tmp.cleanup();
    }
  });
});

// ─── Tests: findDuplicates ─────────────────────────────────────

describe("findDuplicates", () => {
  it("finds duplicates across files", () => {
    const tmp = makeTempDir();
    try {
      const tlRu = createTlDir(tmp.path);
      const entries = findAllEntries(tlRu);
      const duplicates = findDuplicates(entries);
      assert.ok(duplicates.has("Raza"));
      assert.ok(duplicates.has("Hello world"));
      assert.ok(!duplicates.has("How are you?"));
      assert.ok(!duplicates.has("Goodbye"));
    } finally {
      tmp.cleanup();
    }
  });

  it("counts duplicate entries correctly", () => {
    const tmp = makeTempDir();
    try {
      const tlRu = createTlDir(tmp.path);
      const entries = findAllEntries(tlRu);
      const duplicates = findDuplicates(entries);
      assert.equal(duplicates.get("Raza")!.length, 2);
      assert.equal(duplicates.get("Hello world")!.length, 2);
    } finally {
      tmp.cleanup();
    }
  });

  it("first entry is kept (sorted by file)", () => {
    const tmp = makeTempDir();
    try {
      const tlRu = createTlDir(tmp.path);
      const entries = findAllEntries(tlRu);
      const duplicates = findDuplicates(entries);
      const firstRaza = duplicates.get("Raza")![0];
      assert.ok(firstRaza.file.includes("file1.rpy"));
    } finally {
      tmp.cleanup();
    }
  });

  it("no false positives", () => {
    const tmp = makeTempDir();
    try {
      const tlRu = createTlDir(tmp.path);
      const entries = findAllEntries(tlRu);
      const duplicates = findDuplicates(entries);
      for (const [, group] of duplicates) {
        assert.ok(group.length >= 2);
      }
    } finally {
      tmp.cleanup();
    }
  });
});

// ─── Tests: deduplicate ────────────────────────────────────────

describe("deduplicate", () => {
  it("dry-run does not modify files", () => {
    const tmp = makeTempDir();
    try {
      const tlRu = createTlDir(tmp.path);
      const result = deduplicate(tlRu, { lang: "ru", dryRun: true });
      assert.equal(result.duplicatesRemoved, 0);

      const file1 = join(tlRu, "file1.rpy");
      assert.equal(readFileSync(file1, "utf-8"), SAMPLE_RPY);
    } finally {
      tmp.cleanup();
    }
  });

  it("dry-run reports duplicates", () => {
    const tmp = makeTempDir();
    try {
      const tlRu = createTlDir(tmp.path);
      const result = deduplicate(tlRu, { lang: "ru", dryRun: true });
      assert.ok(result.totalDuplicates > 0);
    } finally {
      tmp.cleanup();
    }
  });

  it("actual dedup removes duplicates", () => {
    const tmp = makeTempDir();
    try {
      const tlRu = createTlDir(tmp.path);
      const result = deduplicate(tlRu, { lang: "ru", dryRun: false });
      assert.equal(result.duplicatesRemoved, 2);
      assert.equal(result.filesModified, 1);
    } finally {
      tmp.cleanup();
    }
  });

  it("after dedup no cross-file duplicates remain", () => {
    const tmp = makeTempDir();
    try {
      const tlRu = createTlDir(tmp.path);
      deduplicate(tlRu, { lang: "ru", dryRun: false });

      const entries = findAllEntries(tlRu);
      const duplicates = findDuplicates(entries);

      for (const [, group] of duplicates) {
        const files = new Set(group.map((e) => e.file));
        assert.equal(files.size, 1, `${group[0].old} всё ещё встречается в ${files.size} файлах`);
      }
    } finally {
      tmp.cleanup();
    }
  });

  it("file2 loses duplicate entries", () => {
    const tmp = makeTempDir();
    try {
      const tlRu = createTlDir(tmp.path);
      deduplicate(tlRu, { lang: "ru", dryRun: false });

      const file2Text = readFileSync(join(tlRu, "file2.rpy"), "utf-8");
      const entries = parseTranslateBlocks(file2Text);
      const oldTexts = new Set(entries.map((e) => e[1]));

      assert.ok(!oldTexts.has("Raza"), "Raza должна быть удалена из file2.rpy");
      assert.ok(!oldTexts.has("Hello world"), "Hello world должна быть удалена из file2.rpy");
      assert.ok(oldTexts.has("Goodbye"));
      assert.ok(oldTexts.has("Something else"));
    } finally {
      tmp.cleanup();
    }
  });

  it("file1 keeps all entries", () => {
    const tmp = makeTempDir();
    try {
      const tlRu = createTlDir(tmp.path);
      deduplicate(tlRu, { lang: "ru", dryRun: false });

      const file1Text = readFileSync(join(tlRu, "file1.rpy"), "utf-8");
      const entries = parseTranslateBlocks(file1Text);
      const oldTexts = new Set(entries.map((e) => e[1]));

      assert.ok(oldTexts.has("Raza"));
      assert.ok(oldTexts.has("Hello world"));
      assert.ok(oldTexts.has("How are you?"));
    } finally {
      tmp.cleanup();
    }
  });

  it("returns correct counts", () => {
    const tmp = makeTempDir();
    try {
      const tlRu = createTlDir(tmp.path);
      const result = deduplicate(tlRu, { lang: "ru", dryRun: false });

      assert.equal(result.totalEntries, 7);
      assert.equal(result.totalDuplicates, 4);
      assert.equal(result.duplicatesRemoved, 2);
    } finally {
      tmp.cleanup();
    }
  });

  it("handles empty dir", () => {
    const tmp = makeTempDir();
    try {
      const result = deduplicate(tmp.path, { lang: "ru", dryRun: false });
      assert.equal(result.totalEntries, 0);
      assert.equal(result.duplicatesRemoved, 0);
    } finally {
      tmp.cleanup();
    }
  });

  it("handles nonexistent dir", () => {
    const result = deduplicate("/nonexistent/path", { lang: "ru", dryRun: false });
    assert.equal(result.totalEntries, 0);
  });
});

// ─── Integration Tests ─────────────────────────────────────────

describe("integration", () => {
  it("complex duplicates across 3 files", () => {
    const tmp = makeTempDir();
    try {
      const tlRu = createTlDir(tmp.path);
      const file3 = join(tlRu, "file3.rpy");
      writeFileSync(
        file3,
        [
          "translate ru strings:",
          "",
          '    old "Raza"',
          '    new "Раза"',
          "",
          '    old "Goodbye"',
          '    new "До свидания"',
          "",
          '    old "New string"',
          '    new "Новая строка"',
          "",
        ].join("\n"),
        "utf-8",
      );

      const result = deduplicate(tlRu, { lang: "ru", dryRun: false });
      assert.ok(result.duplicatesRemoved >= 3);
    } finally {
      tmp.cleanup();
    }
  });

  it("no collateral damage to unique entries", () => {
    const tmp = makeTempDir();
    try {
      const tlRu = createTlDir(tmp.path);
      const origFile2 = readFileSync(join(tlRu, "file2.rpy"), "utf-8");
      const origFile1 = readFileSync(join(tlRu, "file1.rpy"), "utf-8");

      deduplicate(tlRu, { lang: "ru", dryRun: false });

      const modFile2 = readFileSync(join(tlRu, "file2.rpy"), "utf-8");
      assert.ok(modFile2 !== origFile2);

      const modFile1 = readFileSync(join(tlRu, "file1.rpy"), "utf-8");
      assert.equal(modFile1, origFile1);
    } finally {
      tmp.cleanup();
    }
  });
});

// ─── Utility Tests ─────────────────────────────────────────────

describe("utility", () => {
  it("VERSION is integer >= 1", () => {
    assert.equal(typeof VERSION, "number");
    assert.ok(Number.isInteger(VERSION));
    assert.ok(VERSION >= 1);
  });

  it("OLD_RE matches old strings", () => {
    const match = OLD_RE.exec('    old "Hello world"');
    assert.ok(match !== null);
    assert.equal(match[1], "Hello world");
  });

  it("OLD_RE does not match new strings", () => {
    const match = OLD_RE.exec('    new "Hello world"');
    assert.equal(match, null);
  });

  it("OLD_RE matches with escaped quotes", () => {
    const match = OLD_RE.exec('    old "Say \\"Hello\\""');
    assert.ok(match !== null);
    assert.equal(match[1], 'Say \\"Hello\\"');
  });

  it("NEW_RE matches new strings", () => {
    const match = NEW_RE.exec('    new "Привет мир"');
    assert.ok(match !== null);
    assert.equal(match[1], "Привет мир");
  });

  it("NEW_RE does not match old strings", () => {
    const match = NEW_RE.exec('    old "Hello"');
    assert.equal(match, null);
  });

  it("OLD_RE matches empty old string", () => {
    const match = OLD_RE.exec('    old ""');
    assert.ok(match !== null);
    assert.equal(match[1], "");
  });
});
