/**
 * Тесты cast_mts.mts — генератор типизированных констант casts/{Name}.mts.
 *
 * Юнит: имя экспорта (пробелы), канонический порядок полей, выкидывание
 * легаси (arcs/who_codes), пофразовая эмоция как запись, ошибки валидации.
 * Живой гард: generate() по фикстурной папке — пишет {Name}.mts рядом с yaml,
 * прогон идемпотентен (второй — обновлено 0).
 * Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/cast_mts.test.mts
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { castIdent, generate, js, renderMts } from "./cast_mts.mts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
/** Фикстуры — только в tmp/ репозитории (правило репы). */
const DIR = join(REPO_ROOT, "tmp", "cast-mts-fixture");

const FULL = {
  name: "Test Voice",
  gender: "M",
  age: "30-40",
  who: "Кто это",
  instruct_en: "desc",
  instruct_ru: "описание",
  texts: ["Реплика раз", "Реплика два"],
  arcs: ["Prologue"], // не переносится
  who_codes: ["tv"], // легаси — не переносится
};

test("castIdent: имя экспорта без пробелов", () => {
  assert.equal(castIdent("Captain Belmont"), "CaptainBelmont");
  assert.equal(castIdent("Xanthippe"), "Xanthippe");
  assert.throws(() => castIdent("   "));
});

test("renderMts: канонический порядок полей, без arcs/who_codes", () => {
  const text = renderMts(FULL, "Test Voice.yaml");
  assert.ok(text.startsWith('import type { CastContract } from "../../cast.types.mts";'));
  assert.ok(text.includes("export const TestVoice: CastContract = {"));
  assert.ok(text.trimEnd().endsWith("};"));
  assert.ok(
    text.indexOf("  name:") < text.indexOf("  gender:") &&
      text.indexOf("  gender:") < text.indexOf("  who:") &&
      text.indexOf("  instruct_ru:") < text.indexOf("  texts:"),
  );
  assert.ok(!text.includes("arcs") && !text.includes("who_codes"));
  assert.ok(text.includes('"Реплика раз",'));
});

test("renderMts: пофразовая эмоция — запись с каноническим порядком ключей", () => {
  const text = renderMts(
    {
      name: "Albert",
      texts: [{ emotion_ru: "с холодной сдержанностью", emotion_en: "Icy", text: "Фраза" }],
    },
    "Albert.yaml",
  );
  assert.ok(
    text.indexOf('"text":') < text.indexOf('"emotion_en":') &&
      text.indexOf('"emotion_en":') < text.indexOf('"emotion_ru":'),
  );
});

test("renderMts: кривые данные падают", () => {
  assert.throws(() => renderMts({ texts: [42] }, "bad.yaml"));
  assert.throws(() => renderMts({ texts: [{ emotion_en: "x" }] }, "bad.yaml"));
  assert.throws(() => renderMts(["not", "a", "dict"], "bad.yaml"));
  assert.throws(() => renderMts({}, "bad.yaml"));
});

test("js: кириллица не эскейпится", () => {
  assert.equal(js("Сара"), '"Сара"');
  assert.equal(js(["а"]), '["а"]');
});

test("generate: пишет {Name}.mts рядом с yaml, прогон идемпотентен", async () => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(join(DIR, "Test Voice"), { recursive: true });
  writeFileSync(join(DIR, "Test Voice", "Test Voice.yaml"), 'name: Test Voice\ngender: F\ntexts:\n- "Фраза"\n', "utf8");

  const first = await generate({ castsDir: DIR });
  assert.deepEqual(first.errors, []);
  assert.equal(first.total, 1);
  assert.deepEqual(first.changed, ["Test Voice"]);
  const mts = join(DIR, "Test Voice", "Test Voice.mts");
  assert.ok(existsSync(mts));
  assert.ok(readFileSync(mts, "utf8").includes("export const TestVoice: CastContract = {"));

  const second = await generate({ castsDir: DIR });
  assert.deepEqual(second.changed, []);
  rmSync(DIR, { recursive: true, force: true });
});
