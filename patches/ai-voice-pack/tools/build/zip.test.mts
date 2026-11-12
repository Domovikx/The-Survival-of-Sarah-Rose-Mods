/** Тесты zip.mts — раунд-трип, zip64-extra и большой архив (65 540 записей). */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildZip64Extra, crc32, overflows32, readZip, writeZip, type ZipEntry } from "./zip.mts";

const DIR = mkdtempSync(join(tmpdir(), "zip64test-"));
process.on("exit", () => rmSync(DIR, { recursive: true, force: true }));

test("overflows32: 0xffffffff — уже маркер, 0xfffffffe влезает", () => {
  assert.equal(overflows32(0xfffffffe), false);
  assert.equal(overflows32(0xffffffff), true);
  assert.equal(overflows32(2 ** 33), true);
});

test("buildZip64Extra: пусто без переполнения; размеры идут парой; смещение — своё", () => {
  assert.equal(buildZip64Extra(10, 5, 0).length, 0);
  // переполнен один размер -> оба в extra (16 байт данных)
  const sizes = buildZip64Extra(2 ** 33, 5, 0);
  assert.equal(sizes.readUInt16LE(0), 0x0001);
  assert.equal(sizes.readUInt16LE(2), 16);
  assert.equal(Number(sizes.readBigUInt64LE(4)), 2 ** 33);
  assert.equal(Number(sizes.readBigUInt64LE(12)), 5);
  // только смещение -> 8 байт данных
  const off = buildZip64Extra(10, 5, 2 ** 33);
  assert.equal(off.readUInt16LE(2), 8);
  assert.equal(Number(off.readBigUInt64LE(4)), 2 ** 33);
  // всё вместе: 16 + 8
  assert.equal(buildZip64Extra(2 ** 33, 5, 2 ** 33).readUInt16LE(2), 24);
});

test("раунд-трип: store+deflate, порядок, байты, CRC", () => {
  const p = join(DIR, "small.zip");
  const entries: ZipEntry[] = [
    { name: "a.txt", store: true, data: Buffer.from("hello zip64") },
    { name: "dir/b.bin", store: false, data: Buffer.alloc(1000, 7) },
    { name: "кириллица.txt", store: false, data: Buffer.from("привет") },
  ];
  const r = writeZip(p, entries, { level: 9 });
  assert.equal(r.nfiles, 3);
  const z = readZip(p);
  assert.deepEqual(z.names, ["a.txt", "dir/b.bin", "кириллица.txt"]);
  assert.equal(z.read("a.txt").toString(), "hello zip64");
  assert.equal(z.read("dir/b.bin").length, 1000);
  assert.equal(z.read("кириллица.txt").toString(), "привет");
});

test("crc32: эталонные значения (полином 0xEDB88320)", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test("большой архив: 65 540 записей — ZIP64-конец, чтение краёв", () => {
  const p = join(DIR, "big.zip");
  const n = 65540;
  function* gen(): Generator<ZipEntry> {
    for (let i = 0; i < n; i++) yield { name: `e${i}.dat`, store: true, data: Buffer.from(`v${i}`) };
  }
  const r = writeZip(p, gen());
  assert.equal(r.nfiles, n);
  const z = readZip(p);
  assert.equal(z.names.length, n);
  assert.equal(z.names[0], "e0.dat");
  assert.equal(z.names[n - 1], `e${n - 1}.dat`);
  assert.equal(z.read("e0.dat").toString(), "v0");
  assert.equal(z.read(`e${n - 1}.dat`).toString(), `v${n - 1}`);
  assert.equal(z.read("e30000.dat").toString(), "v30000");
  // у каждой записи сходится CRC (read() проверяет)
  for (const e of z.entries.slice(0, 5)) assert.equal(e.crc32, crc32(Buffer.from(`v${e.name.slice(1, -4)}`)));
});
