/**
 * Тесты voice_manage.mts (порт python voice_manage.py): list/status/select
 * на фикстурном дереве casts/voices (реальные пути не трогаются).
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { listVoices, select } from "./voice_manage.mts";

function fixture(): { baseDir: string; voices: Record<string, string | null> } {
  const baseDir = mkdtempSync(join(tmpdir(), "manage-"));
  // Sarah: активный реф + два варианта + отобранный кандидат.
  mkdirSync(join(baseDir, "Sarah", "gen_selected"), { recursive: true });
  writeFileSync(join(baseDir, "Sarah", "Sarah.wav"), "base", "utf-8");
  writeFileSync(join(baseDir, "Sarah", "Sarah_1.wav"), "v1", "utf-8");
  writeFileSync(join(baseDir, "Sarah", "Sarah_3.wav"), "v3", "utf-8");
  writeFileSync(join(baseDir, "Sarah", "gen_selected", "a.mp3"), "mp3", "utf-8");
  // Ghost: папка есть, рефа нет (wired=null).
  mkdirSync(join(baseDir, "Ghost"), { recursive: true });
  const voices = {
    Sarah: "./voices/Sarah/Sarah.wav",
    Ghost: null as string | null,
  };
  return { baseDir, voices };
}

test("listVoices: активный реф, варианты, gen_selected", () => {
  const { baseDir, voices } = fixture();
  const all = listVoices(voices, baseDir);
  assert.deepEqual(
    all.map((v) => v.name),
    ["Ghost", "Sarah"],
  );
  const [ghost, sarah] = all;
  assert.equal(ghost.active, false);
  assert.deepEqual(ghost.variants, []);
  assert.equal(sarah.active, true);
  assert.deepEqual(sarah.variants, ["Sarah_1", "Sarah_3"]);
  assert.deepEqual(sarah.genSelected, ["a"]);
});

test("select: вариант -> активный реф (перетирает {Имя}.wav)", () => {
  const { baseDir } = fixture();
  assert.equal(select("Sarah", "1", baseDir), 0);
  assert.equal(readFileSync(join(baseDir, "Sarah", "Sarah.wav"), "utf-8"), "v1");
});

test("select: базовый вариант (пустой) = no-op, реф уже активен", () => {
  const { baseDir } = fixture();
  assert.equal(select("Sarah", "", baseDir), 0);
  assert.equal(readFileSync(join(baseDir, "Sarah", "Sarah.wav"), "utf-8"), "base");
});

test("select ошибки: нет варианта / нет каста -> код 1", () => {
  const { baseDir } = fixture();
  assert.equal(select("Sarah", "9", baseDir), 1);
  assert.equal(select("Ghost", "", baseDir), 1); // папка есть, рефа нет
  assert.equal(select("Nope", "1", baseDir), 1); // папки нет
});
