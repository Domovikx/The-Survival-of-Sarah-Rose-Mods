// vox_queue.test.mts — тесты чистых функций очереди Vox-генерации.
// Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/vox_queue.test.mts
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DEFAULT_ARCS, benchQueueArgs, parseQueueCli, progressLine, progressState } from "./vox_queue.mts";

test("parseQueueCli: язык + арки по умолчанию (три стартовые)", () => {
  const cli = parseQueueCli(["ru"]);
  assert.equal(cli.lang, "ru");
  assert.deepEqual(cli.arcs, [...DEFAULT_ARCS]);
  assert.deepEqual(cli.arcs, ["Prologue", "StoryBeginnings", "WarArc"]);
  assert.equal(cli.dryRun, false);
});

test("parseQueueCli: явные арки и --dry-run", () => {
  const cli = parseQueueCli(["de", "WarArc", "Prologue", "--dry-run"]);
  assert.equal(cli.lang, "de");
  assert.deepEqual(cli.arcs, ["WarArc", "Prologue"]);
  assert.equal(cli.dryRun, true);
});

test("parseQueueCli: все 11 языков принимаются", () => {
  for (const lang of ["ru", "en", "de", "es", "fr", "it", "ja", "ko", "pl", "pt", "zh"]) {
    assert.equal(parseQueueCli([lang]).lang, lang);
  }
});

test("parseQueueCli: мусор отклоняется (язык/отсутствие)", () => {
  assert.throws(() => parseQueueCli([]), /usage/);
  assert.throws(() => parseQueueCli(["xx"]), /неизвестный язык/);
});

test("benchQueueArgs: конфиг пролога + denoise + resume + picks на весь пул", () => {
  const args = benchQueueArgs("es", "WarArc");
  assert.equal(args[0].endsWith("voxcpm_bench.mts"), true);
  const has = (flag: string, value: string): boolean => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] === value;
  };
  assert.ok(has("--lang", "es"));
  assert.ok(has("--arc", "WarArc"));
  assert.ok(has("--picks", "99999"));
  assert.ok(has("--seed", "49"));
  assert.ok(has("--cfg", "2.6"));
  assert.ok(has("--ts", "30"));
  // denoise явным --opt: имя файла несёт `_dn`, как у корпуса пролога
  assert.ok(has("--opt", "denoise=true"));
  assert.equal(args.includes("--resume"), true);
});

test("progressLine: resume-заголовок -> счётчик skipped/remaining", () => {
  const st = progressState();
  assert.equal(progressLine("resume: пропущено готовых 10, в работе 5", st, "Prologue"), null);
  assert.equal(st.skipped, 10);
  assert.equal(st.remaining, 5);
});

test("progressLine: завершённая фраза -> [i/N] vox {arc} (формат PROGRESS_RE пульта)", () => {
  const st = progressState();
  progressLine("resume: пропущено готовых 10, в работе 5", st, "Prologue");
  assert.equal(progressLine("  1. abc123__Vox: фраза, gen 3.1с", st, "Prologue"), "[11/15] vox Prologue");
  assert.equal(progressLine("  2. def456__Vox: фраза, gen 2.8с", st, "Prologue"), "[12/15] vox Prologue");
});

test("progressLine: план-листинг и FAIL не двигают счётчик (незавершённая фраза не в opus)", () => {
  const st = progressState();
  progressLine("resume: пропущено готовых 0, в работе 2", st, "WarArc");
  assert.equal(progressLine("прогонов=2 (пачка)", st, "WarArc"), null);
  assert.equal(progressLine("  1. ghi789__Vox: FAIL: OOM", st, "WarArc"), null);
  assert.equal(st.done, 0);
});

test("progressLine: без resume-заголовка total берётся из 'прогонов=N' стенда", () => {
  const st = progressState();
  assert.equal(progressLine("прогонов=3 (пачка)", st, "StoryBeginnings"), null);
  assert.equal(progressLine("  1. aaa__Vox: фраза, gen 1.0с", st, "StoryBeginnings"), "[1/3] vox StoryBeginnings");
});

test("progressLine: всё готово (remaining=0) -> итог [skipped/skipped]", () => {
  const st = progressState();
  assert.equal(progressLine("resume: пропущено готовых 238, в работе 0", st, "Prologue"), "[238/238] vox Prologue");
});
