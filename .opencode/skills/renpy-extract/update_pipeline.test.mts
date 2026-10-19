/**
 * E2E: сценарий обновления игры (имитация апдейта).
 *
 * Пайплайн в тесте — как при реальном обновлении:
 *   1. Релиз v1: extract → generate → переводим всё (tlstat: 0 непереведённых).
 *   2. Апдейт игры → v2: одна строка НОВАЯ, одна ИЗМЕНЁННАЯ, одна УДАЛЁННАЯ,
 *      одна НЕТРОНУТАЯ (контроль) + UI-строка (контроль в другом файле).
 *   3. Re-extract: новые/изменённые падают в tl как непереведённые
 *      (new == old), старый оригинал изменённой строки и удалённая строка
 *      вычищаются, переводы нетронутых сохраняются.
 *   4. tlstat (list_translation_files) находит ровно 2 непереведённых.
 *   5. «Переводим» → tlstat: 0.
 *   6. dedup реальным CLI (запуск из скрипта, как в SKILL) → чисто.
 *   7. verifyIntegrity → [total, done] == [4, 4] (100%).
 *
 * Запуск:
 *   node --test update_pipeline.test.mts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { RenPyExtractor, generateRpy, verifyIntegrity, _esc, _unescape } from "./extract_texts.mts";
import { collectFiles } from "../list-translation-files/list_translation_files.mts";

// ─── Helpers ──────────────────────────────────────────────────

interface TempDir {
  path: string;
  cleanup: () => void;
}

function makeTempDir(): TempDir {
  const path = mkdtempSync(join(tmpdir(), "update-e2e-"));
  return {
    path,
    cleanup: () => rmSync(path, { recursive: true, force: true }),
  };
}

/** Проставляет переводы в сгенерированных tl/.rpy по словарю old → new. */
function applyTranslations(tlDir: string, translations: Record<string, string>): void {
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".rpy")) {
        let currentOld: string | null = null;
        const out = readFileSync(fullPath, "utf-8")
          .split("\n")
          .map((line) => {
            const s = line.trim();
            if (s.startsWith("old ")) {
              const m = /^old "(.*)"\s*$/.exec(s);
              currentOld = m ? _unescape(m[1]) : null;
              return line;
            }
            if (currentOld !== null && s.startsWith("new ")) {
              const repl = translations[currentOld];
              currentOld = null;
              if (repl === undefined) return line;
              const m = /^(\s*new ")(.*)("\s*)$/.exec(line);
              if (!m) return line;
              return `${m[1]}${_esc(repl)}${m[3]}`;
            }
            return line;
          });
        writeFileSync(fullPath, out.join("\n"), "utf-8");
      }
    }
  }
  walk(tlDir);
}

/** Читает пары old → new из одного сгенерированного .rpy. */
function readPairs(file: string): Map<string, string> {
  const pairs = new Map<string, string>();
  let currentOld: string | null = null;
  for (const raw of readFileSync(file, "utf-8").split("\n")) {
    const s = raw.trim();
    if (s.startsWith("old ")) {
      const m = /^old "(.*)"\s*$/.exec(s);
      currentOld = m ? _unescape(m[1]) : null;
    } else if (currentOld !== null && s.startsWith("new ")) {
      const m = /^new "(.*)"\s*$/.exec(s);
      if (m) pairs.set(currentOld, _unescape(m[1]));
      currentOld = null;
    }
  }
  return pairs;
}

/** Сколько строк в tl ещё не переведено (new == old), по данным tlstat. */
function untranslatedCount(tlDir: string, projectRoot: string): number {
  let count = 0;
  for (const files of Object.values(collectFiles(tlDir, projectRoot))) {
    for (const f of files) count += f.stats.total - f.stats.translated;
  }
  return count;
}

// ─── Fixtures: v1 (релиз) и v2 (апдейт) ──────────────────────

const V1_SCRIPT = [
  "label start:",
  '    "Первая строка релиза — контроль."',
  '    "Строка, которая пропадёт в апдейте."',
  '    "Строка, которую апдейт изменит."',
  "",
].join("\n");

const V2_SCRIPT = [
  "label start:",
  '    "Первая строка релиза — контроль."',
  '    "Строка, которую апдейт изменит. Пересказ!"',
  '    "Совсем новая строка апдейта."',
  "",
].join("\n");

const SCREENS_RPY = 'textbutton _("Back to menu") action MainMenu()';

const CONTROL_OLD = "Первая строка релиза — контроль.";
const REMOVED_OLD = "Строка, которая пропадёт в апдейте.";
const CHANGED_OLD = "Строка, которую апдейт изменит.";
const CHANGED_NEW = "Строка, которую апдейт изменит. Пересказ!";
const ADDED_NEW = "Совсем новая строка апдейта.";
const UI_OLD = "Back to menu";

// ─── Tests ────────────────────────────────────────────────────

describe("TestGameUpdatePipeline", () => {
  it("v1 → апдейт v2: найти новое/изменённое/удалённое → перевести → dedup → verify 100%", () => {
    const tmp = makeTempDir();
    try {
      const gameDir = join(tmp.path, "game");
      const tlDir = join(gameDir, "tl", "ru");
      mkdirSync(gameDir, { recursive: true });
      writeFileSync(join(gameDir, "script.rpy"), V1_SCRIPT, "utf-8");
      writeFileSync(join(gameDir, "screens.rpy"), SCREENS_RPY, "utf-8");

      // ── 1. Релиз v1: extract → generate → переводим всё ──
      const v1 = new RenPyExtractor(gameDir);
      generateRpy(v1.scan(), tlDir);
      applyTranslations(tlDir, {
        [CONTROL_OLD]: "Контрольная строка релиза.",
        [REMOVED_OLD]: "Эту строку удалят в апдейте.",
        [CHANGED_OLD]: "Эту строку апдейт изменит.",
        [UI_OLD]: "Назад в меню",
      });
      assert.equal(untranslatedCount(tlDir, tmp.path), 0, "v1: перевод завершён");

      // ── 2. Апдейт игры → v2: +новая, ~изменённая, −удалённая; UI не тронут ──
      writeFileSync(join(gameDir, "script.rpy"), V2_SCRIPT, "utf-8");

      const v2 = new RenPyExtractor(gameDir);
      v2.setExistingTranslations(tlDir);
      generateRpy(v2.scan(), tlDir);

      // ── 3. Категории после re-extract ──
      const scene = readPairs(join(tlDir, "Other", "start.rpy"));

      // КОНТРОЛЬ: нетронутая строка сохранила перевод сквозь регенерацию
      assert.equal(scene.get(CONTROL_OLD), "Контрольная строка релиза.", "контроль: перевод сохранён");
      // НОВОЕ: появилось, но пока new == old (ждёт перевода)
      assert.equal(scene.get(ADDED_NEW), ADDED_NEW, "новое: есть и непереведено");
      // ИЗМЕНЁННОЕ: старый оригинал вычищен, новый — непереведённый
      assert.equal(scene.has(CHANGED_OLD), false, "изменённое: старый оригинал удалён");
      assert.equal(scene.get(CHANGED_NEW), CHANGED_NEW, "изменённое: новый оригинал непереведён");
      // УДАЛЁННОЕ: выпало из tl
      assert.equal(scene.has(REMOVED_OLD), false, "удалённое: вычищено из tl");
      // КОНТРОЛЬ UI: второй файл (screens.rpy) перегенерирован, перевод цел
      assert.equal(readPairs(join(tlDir, "screens.rpy")).get(UI_OLD), "Назад в меню", "UI-контроль: перевод сохранён");

      // ── 4. НАЙТИ непереведённое (tlstat) ──
      assert.equal(untranslatedCount(tlDir, tmp.path), 2, "найдено: новая + изменённая");

      // ── 5. ПЕРЕВЕСТИ найденное ──
      applyTranslations(tlDir, {
        [ADDED_NEW]: "Совсем новая строка апдейта (RU).",
        [CHANGED_NEW]: "Пересказ строки (RU).",
      });
      assert.equal(untranslatedCount(tlDir, tmp.path), 0, "после перевода: 0 непереведённых");

      // ── 6. DEDUP реальным CLI (как в SKILL, пишет только в temp-проект) ──
      const dedupPath = fileURLToPath(new URL("../renpy-dedup/dedup_translations.mts", import.meta.url));
      const run = spawnSync(process.execPath, [dedupPath, "--project", tmp.path], { encoding: "utf-8" });
      assert.equal(run.status, 0, `dedup завершился с ошибкой:\n${run.stderr}`);
      assert.ok(run.stdout.includes("Найдено old/new пар: 4"), `ожидалось 4 пары, получено:\n${run.stdout}`);
      assert.ok(run.stdout.includes("Дубликаты не найдены"), `ожидалась чистота, получено:\n${run.stdout}`);

      // ── 7. VERIFY: целостность после апдейта 100% ──
      const [total, done] = verifyIntegrity(gameDir, tlDir);
      assert.equal(total, 4, "verify: 3 строки сцены + 1 UI (удалённая не считается)");
      assert.equal(done, total, "verify: всё переведено");
    } finally {
      tmp.cleanup();
    }
  });
});
