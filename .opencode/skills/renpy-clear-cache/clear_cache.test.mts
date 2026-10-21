/**
 * Tests for clear_cache.mts
 * ==========================
 * Проверяем что кэш-файлы корректно находим и удаляем.
 *
 * Требования:
 * - Node.js >= 18 (использует node:test, node:assert/strict)
 * - Никаких внешних зависимостей
 *
 * Запуск:
 *   node --test clear_cache.test.mts
 *   node --test .opencode/skills/renpy-clear-cache/clear_cache.test.mts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { clearCache, findCacheFiles, findCacheDirs, sizeStr, VERSION } from "./clear_cache.mts";

/** Временная директория: путь и функция очистки. */
interface TempDir {
  path: string;
  cleanup: () => void;
}

/**
 * @param prefix - префикс имени временной директории
 */
function makeTempDir(prefix: string = "cc-test-"): TempDir {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    path: dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Создаёт временную директорию с имитацией игры и кэша.
 * @param basePath - базовый путь
 * @returns путь к game/
 */
function createGameDir(basePath: string): string {
  const game = join(basePath, "game");
  mkdirSync(game, { recursive: true });

  // Обычные файлы игры — НЕ должны удаляться
  writeFileSync(join(game, "script.rpy"), 'label start:\n    "Hello"\n', "utf-8");
  writeFileSync(join(game, "screens.rpy"), "screen test:\n    pass\n", "utf-8");
  writeFileSync(join(game, "options.rpy"), "## Options\n", "utf-8");
  writeFileSync(join(game, "gui.rpy"), "## GUI\n", "utf-8");

  // Кэш-файлы — ДОЛЖНЫ удаляться
  writeFileSync(join(game, "script.rpyc"), Buffer.from([0x00, 0x00, 0x00]));
  writeFileSync(join(game, "screens.rpyc"), Buffer.from([0x00, 0x00, 0x00]));
  writeFileSync(join(game, "error.log"), "Traceback...\n", "utf-8");

  // __pycache__ директории — ДОЛЖНЫ удаляться
  const pycache = join(game, "__pycache__");
  mkdirSync(pycache);
  writeFileSync(join(pycache, "script.cpython-314.pyc"), Buffer.from([0x00]));
  writeFileSync(join(pycache, "screens.cpython-314.pyc"), Buffer.from([0x00]));

  // Вложенная структура
  const subdir = join(game, "submod");
  mkdirSync(subdir);
  writeFileSync(join(subdir, "module.rpyc"), Buffer.from([0x00]));
  const subPycache = join(subdir, "__pycache__");
  mkdirSync(subPycache);
  writeFileSync(join(subPycache, "module.cpython-314.pyc"), Buffer.from([0x00]));

  // .pytest_cache — ДОЛЖНА удаляться
  const pytestCache = join(game, ".pytest_cache");
  mkdirSync(pytestCache);
  writeFileSync(join(pytestCache, "CACHEDIR.TAG"), "Signature: 8a477f597d28d172789f06886806bc55", "utf-8");

  return game;
}

// ─── Tests: findCacheFiles ──────────────────────────────────────

describe("findCacheFiles", () => {
  it("finds .rpyc files", () => {
    const tmp = makeTempDir();
    try {
      const game = createGameDir(tmp.path);
      const files = findCacheFiles(game);
      const names = new Set(files.map((f: string) => f.split(/[\\/]/).pop()));
      assert.ok(names.has("script.rpyc"));
      assert.ok(names.has("screens.rpyc"));
      assert.ok(names.has("module.rpyc"));
    } finally {
      tmp.cleanup();
    }
  });

  it("finds .log files", () => {
    const tmp = makeTempDir();
    try {
      const game = createGameDir(tmp.path);
      const files = findCacheFiles(game);
      const names = files.map((f: string) => f.split(/[\\/]/).pop());
      assert.ok(names.includes("error.log"));
    } finally {
      tmp.cleanup();
    }
  });

  it("finds __pycache__ files", () => {
    const tmp = makeTempDir();
    try {
      const game = createGameDir(tmp.path);
      const files = findCacheFiles(game);
      const names = new Set(files.map((f: string) => f.split(/[\\/]/).pop()));
      assert.ok(names.has("script.cpython-314.pyc"));
      assert.ok(names.has("module.cpython-314.pyc"));
    } finally {
      tmp.cleanup();
    }
  });

  it("ignores actual .rpy files", () => {
    const tmp = makeTempDir();
    try {
      const game = createGameDir(tmp.path);
      const files = findCacheFiles(game);
      const names = new Set(files.map((f: string) => f.split(/[\\/]/).pop()));
      assert.ok(!names.has("script.rpy"));
      assert.ok(!names.has("screens.rpy"));
    } finally {
      tmp.cleanup();
    }
  });

  it("ignores .git directory", () => {
    const tmp = makeTempDir();
    try {
      const game = createGameDir(tmp.path);
      const gitDir = join(game, ".git");
      mkdirSync(gitDir);
      writeFileSync(join(gitDir, "config"), "git config", "utf-8");
      mkdirSync(join(gitDir, "hooks"));
      const files = findCacheFiles(game);
      const hasGit = files.some((f: string) => f.includes(".git"));
      assert.ok(!hasGit);
    } finally {
      tmp.cleanup();
    }
  });
});

// ─── Tests: findCacheDirs ───────────────────────────────────────

describe("findCacheDirs", () => {
  it("finds __pycache__ dirs", () => {
    const tmp = makeTempDir();
    try {
      const game = createGameDir(tmp.path);
      const dirs = findCacheDirs(game);
      const dirNames = dirs.map((d: string) => d.split(/[\\/]/).pop());
      assert.ok(dirNames.includes("__pycache__"));
    } finally {
      tmp.cleanup();
    }
  });

  it("finds .pytest_cache dirs", () => {
    const tmp = makeTempDir();
    try {
      const game = createGameDir(tmp.path);
      const dirs = findCacheDirs(game);
      const dirNames = dirs.map((d: string) => d.split(/[\\/]/).pop());
      assert.ok(dirNames.includes(".pytest_cache"));
    } finally {
      tmp.cleanup();
    }
  });
});

// ─── Tests: clearCache ──────────────────────────────────────────

describe("clearCache", () => {
  it("dry-run does not delete", () => {
    const tmp = makeTempDir();
    try {
      const game = createGameDir(tmp.path);
      const rpyc = join(game, "script.rpyc");
      assert.ok(existsSync(rpyc));

      clearCache(game, { dryRun: true });
      assert.ok(existsSync(rpyc), "dry-run должен сохранять файлы");
    } finally {
      tmp.cleanup();
    }
  });

  it("actual delete removes .rpyc", () => {
    const tmp = makeTempDir();
    try {
      const game = createGameDir(tmp.path);
      const rpyc = join(game, "script.rpyc");
      assert.ok(existsSync(rpyc));

      const result = clearCache(game, { dryRun: false });
      assert.ok(!existsSync(rpyc));
      assert.ok(result.filesRemoved >= 1);
    } finally {
      tmp.cleanup();
    }
  });

  it("actual delete removes logs", () => {
    const tmp = makeTempDir();
    try {
      const game = createGameDir(tmp.path);
      const log = join(game, "error.log");
      assert.ok(existsSync(log));

      clearCache(game, { dryRun: false });
      assert.ok(!existsSync(log));
    } finally {
      tmp.cleanup();
    }
  });

  it("actual delete removes __pycache__ dir", () => {
    const tmp = makeTempDir();
    try {
      const game = createGameDir(tmp.path);
      const pycache = join(game, "__pycache__");
      assert.ok(existsSync(pycache));

      clearCache(game, { dryRun: false });
      assert.ok(!existsSync(pycache));
    } finally {
      tmp.cleanup();
    }
  });

  it("does not delete .rpy files", () => {
    const tmp = makeTempDir();
    try {
      const game = createGameDir(tmp.path);
      const rpy = join(game, "script.rpy");

      clearCache(game, { dryRun: false });
      assert.ok(existsSync(rpy), "Файлы .rpy не должны удаляться!");
    } finally {
      tmp.cleanup();
    }
  });

  it("does not delete screens.rpy", () => {
    const tmp = makeTempDir();
    try {
      const game = createGameDir(tmp.path);
      const screens = join(game, "screens.rpy");

      clearCache(game, { dryRun: false });
      assert.ok(existsSync(screens), "Файлы .rpy не должны удаляться!");
    } finally {
      tmp.cleanup();
    }
  });

  it("returns correct counts", () => {
    const tmp = makeTempDir();
    try {
      const game = createGameDir(tmp.path);
      const result = clearCache(game, { dryRun: false });

      assert.ok(result.filesRemoved > 0);
      assert.ok(result.spaceFreed >= 0);
    } finally {
      tmp.cleanup();
    }
  });
});

// ─── Utility Tests ──────────────────────────────────────────────

describe("sizeStr", () => {
  it("formats bytes", () => {
    assert.equal(sizeStr(100), "100 B");
  });

  it("formats KB", () => {
    assert.equal(sizeStr(2048), "2.0 KB");
  });

  it("formats MB", () => {
    assert.equal(sizeStr(1048576), "1.0 MB");
  });
});

describe("VERSION", () => {
  it("is an integer", () => {
    assert.equal(typeof VERSION, "number");
    assert.ok(Number.isInteger(VERSION));
    assert.equal(VERSION, 1);
  });
});

// ─── Integration: full clean ────────────────────────────────────

describe("integration", () => {
  it("full clean leaves no cache", () => {
    const tmp = makeTempDir();
    try {
      const game = createGameDir(tmp.path);

      assert.ok(findCacheFiles(game).length > 0);

      clearCache(game, { dryRun: false });

      const remaining = findCacheFiles(game);
      assert.equal(remaining.length, 0, `Остались файлы кэша: ${remaining}`);

      assert.ok(existsSync(join(game, "script.rpy")));
      assert.ok(existsSync(join(game, "screens.rpy")));
    } finally {
      tmp.cleanup();
    }
  });
});
