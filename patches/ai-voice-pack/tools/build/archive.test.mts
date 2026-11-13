/**
 * archive.test.mts — тесты .7z-архиватора (обёртки над 7z.exe).
 *
 * Проверяем контракт, а не 7z: пути внутри архива = arcname с прямыми
 * слэшами (раскладка установки), каталоги в листинг не попадают, байты
 * читаются обратно один-в-один, -mx=9 реально сжимает, ошибки — понятные
 * ArchiveAbort (а не «7z вернул 2»).
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { ArchiveAbort, find7z, listArchive, readArchive, reset7zCache, writeArchive } from "./archive.mts";

/** tmp_path в pytest: создаём временный каталог, чистим за собой. */
function withTmp(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "tssr_archive_"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 7z может отсутствовать на чужой машине — тесты архива тогда неприменимы. */
function require7z(t: TestContext): boolean {
  try {
    find7z();
    return true;
  } catch (e) {
    if (e instanceof ArchiveAbort) {
      t.skip(e.message);
      return false;
    }
    throw e;
  }
}

function test_roundtrip_layout_and_bytes(t: TestContext): void {
  if (!require7z(t)) return;
  withTmp((tmp) => {
    const fontSrc = join(tmp, "Literata-Bold.ttf");
    writeFileSync(fontSrc, "font-bytes");
    const opusSrc = join(tmp, "a.opus");
    writeFileSync(opusSrc, Buffer.from([1, 2, 3, 0, 255]));
    const target = join(tmp, "out.7z");
    const res = writeArchive(
      target,
      [
        { name: "README.txt", data: Buffer.from("hello archive\n", "utf-8") },
        { name: "mods/tssr-ai-voice-pack/fonts/Literata-Bold.ttf", path: fontSrc },
        { name: "mods/tssr-ai-voice-pack/ai_voice/ru/Opening/a.opus", path: opusSrc },
        { name: "environment.txt", data: Buffer.from('RENPY_SEARCHPATH = "mods"\n', "utf-8") },
      ],
      { level: 0 },
    );
    assert.equal(res.nfiles, 4);
    assert.ok(res.nbytes > 0, "несжатый размер не посчитан");
    // Порядок в листинге 7z не гарантирован — состав точный, каталогов нет.
    assert.deepEqual(listArchive(target).toSorted(), [
      "README.txt",
      "environment.txt",
      "mods/tssr-ai-voice-pack/ai_voice/ru/Opening/a.opus",
      "mods/tssr-ai-voice-pack/fonts/Literata-Bold.ttf",
    ]);
    const zf = readArchive(target);
    assert.equal(zf.read("README.txt").toString("utf-8"), "hello archive\n");
    assert.equal(zf.read("mods/tssr-ai-voice-pack/fonts/Literata-Bold.ttf").toString("utf-8"), "font-bytes");
    assert.deepEqual([...zf.read("mods/tssr-ai-voice-pack/ai_voice/ru/Opening/a.opus")], [1, 2, 3, 0, 255]);
  });
}

function test_level9_compresses_and_overwrites(t: TestContext): void {
  if (!require7z(t)) return;
  withTmp((tmp) => {
    const target = join(tmp, "main.7z");
    const payload = Buffer.from("THE SURVIVAL OF SARAH ROSE\n".repeat(40_000), "utf-8");
    const entries = [{ name: "text.txt", data: payload }];
    writeArchive(target, entries, { level: 0 });
    const sizeStored = statSync(target).size;
    const raw = readArchive(target).read("text.txt");
    writeArchive(target, entries, { level: 9 }); // существующий архив обязан перезаписаться
    const sizePacked = statSync(target).size;
    const packed = readArchive(target).read("text.txt");
    assert.equal(raw.length, packed.length, "уровень сжатия не имеет права менять содержимое");
    assert.ok(sizePacked * 2 < sizeStored, `-mx=9 не сжал: ${sizeStored} -> ${sizePacked}`);
    assert.equal(listArchive(target).length, 1, "повторная сборка дописала записи вместо перезаписи архива");
  });
}

function test_missing_7z_override_is_clear_error(t: TestContext): void {
  if (!require7z(t)) return;
  const orig = process.env.TSSR_7Z;
  process.env.TSSR_7Z = join(tmpdir(), "no-such-7z", "7z.exe");
  reset7zCache();
  try {
    assert.throws(
      () => find7z(),
      (e: unknown) => e instanceof ArchiveAbort && e.message.includes("TSSR_7Z"),
      "подмена TSSR_7Z обязана давать понятную ошибку",
    );
  } finally {
    if (orig === undefined) delete process.env.TSSR_7Z;
    else process.env.TSSR_7Z = orig;
    reset7zCache();
  }
}

function test_read_broken_archive_is_clear_error(t: TestContext): void {
  if (!require7z(t)) return;
  withTmp((tmp) => {
    const broken = join(tmp, "broken.7z");
    writeFileSync(broken, "not an archive");
    assert.throws(
      () => listArchive(broken),
      (e: unknown) => e instanceof ArchiveAbort && e.message.includes("7z не прочитал"),
    );
  });
}

test("test_roundtrip_layout_and_bytes", test_roundtrip_layout_and_bytes);
test("test_level9_compresses_and_overwrites", test_level9_compresses_and_overwrites);
test("test_missing_7z_override_is_clear_error", test_missing_7z_override_is_clear_error);
test("test_read_broken_archive_is_clear_error", test_read_broken_archive_is_clear_error);
