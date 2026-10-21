/**
 * add_candidate.test.mts — интеграционные тесты add_candidate
 * (ПОРТ test_pipeline.py: gen_selected -> корень каста, 3 кейса).
 *
 * Работают во временном дереве casts/ (боевые CASTS_DIR/VOICES_MTS не трогаются).
 * ffmpeg-кейсы пропускаются, если ffmpeg не найден (как python skip).
 * Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/add_candidate.test.mts
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { main } from "./add_candidate.mts";
import { runOk } from "./clean_refs.mts";

const HAS_FFMPEG = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;

let tmp: string;
let castsDir: string;
let voicesPath: string;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), "add-candidate-test-"));
  castsDir = join(tmp, "casts", "voices");
  mkdirSync(join(castsDir, "TestVoice", "gen_selected"), { recursive: true });
  voicesPath = join(tmp, "voices.mts");
  writeFileSync(voicesPath, 'export const VOICES = {\n  "TestVoice": null,\n} as const;\n', "utf8");
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** Свежее дерево каста на каждый тест (как python-фикстура full_project). */
function freshCast(name: string): void {
  rmSync(join(castsDir, name), { recursive: true, force: true });
  mkdirSync(join(castsDir, name, "gen_selected"), { recursive: true });
  writeFileSync(voicesPath, `export const VOICES = {\n  "${name}": null,\n} as const;\n`, "utf8");
}

/** 12-секундный mp3-кандидат в gen_selected (как python-фикстура). */
function makeMp3(name: string): string {
  const mp3 = join(castsDir, "TestVoice", "gen_selected", name);
  runOk("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=12",
    "-ac",
    "1",
    "-ar",
    "24000",
    "-b:a",
    "96k",
    mp3,
  ]);
  return mp3;
}

function refPath(): string {
  return join(castsDir, "TestVoice", "TestVoice.wav");
}

describe("add_candidate.mts", { skip: HAS_FFMPEG ? false : "ffmpeg не найден" }, () => {
  it("mp3 из gen_selected -> TestVoice.wav (корень каста, нарезка 10с)", () => {
    freshCast("TestVoice");
    makeMp3("TestVoice.mp3");
    const rc = main(["--only", "TestVoice"], { castsDir, voicesPath });
    assert.equal(rc, 0);

    const ref = refPath();
    assert.ok(existsSync(ref));
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=duration", "-of", "csv=p=0", ref], {
      encoding: "utf8",
    });
    const dur = Number.parseFloat((probe.stdout ?? "").trim().split(/\r?\n/)[0]);
    assert.ok(dur >= 9.0 && dur <= 10.5, `длительность ${dur}`);
    assert.ok(statSync(ref).size > 1000);

    // Голос подключён: null -> путь рефа в voices.mts
    const voices = readFileSync(voicesPath, "utf8");
    assert.ok(voices.includes('"TestVoice": "./voices/TestVoice/TestVoice.wav"'));
  });

  it("один mp3 с любым именем -> TestVoice.wav (без _суффикса)", () => {
    freshCast("TestVoice");
    makeMp3("04.mp3");
    const rc = main(["--only", "TestVoice"], { castsDir, voicesPath });
    assert.equal(rc, 0);
    assert.ok(existsSync(refPath()));
    assert.ok(!existsSync(join(castsDir, "TestVoice", "TestVoice_04.wav")));
  });

  it("повторный запуск НЕ пересоздаёт существующий реф", () => {
    freshCast("TestVoice");
    makeMp3("TestVoice.mp3");
    const rc1 = main(["--only", "TestVoice"], { castsDir, voicesPath });
    assert.equal(rc1, 0);
    const mtime = statSync(refPath()).mtimeMs;
    const bytes = readFileSync(refPath());
    const rc2 = main(["--only", "TestVoice"], { castsDir, voicesPath });
    assert.equal(rc2, 0);
    assert.equal(statSync(refPath()).mtimeMs, mtime);
    assert.deepEqual(readFileSync(refPath()), bytes);
  });
});
