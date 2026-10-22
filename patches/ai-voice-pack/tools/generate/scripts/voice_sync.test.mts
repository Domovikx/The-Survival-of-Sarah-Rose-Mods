/**
 * Тесты voice_sync.mts (порт python voice_sync.py): слои/расхождения status,
 * план и применение update на фикстурном дереве.
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { applyUpdate, contractIdent, contractStub, planUpdate, status } from "./voice_sync.mts";

test("contractIdent: имя каста -> идентификатор экспорта", () => {
  assert.equal(contractIdent("Captain Belmont"), "CaptainBelmont");
  assert.equal(contractIdent("Sarah"), "Sarah");
});

function fixture(): string {
  const baseDir = mkdtempSync(join(tmpdir(), "sync-"));
  // Sarah: полный слой (dir+contract+wired+ref).
  mkdirSync(join(baseDir, "Sarah"), { recursive: true });
  writeFileSync(join(baseDir, "Sarah", "Sarah.mts"), "// contract", "utf-8");
  writeFileSync(join(baseDir, "Sarah", "Sarah.wav"), "ref", "utf-8");
  // RefOnly: реф на месте, в реестре не подключён.
  mkdirSync(join(baseDir, "RefOnly"), { recursive: true });
  writeFileSync(join(baseDir, "RefOnly", "RefOnly.wav"), "ref", "utf-8");
  // Orphan: папка без реестра.
  mkdirSync(join(baseDir, "Orphan"), { recursive: true });
  return baseDir;
}

test("status: слои и расхождения (wired-no-ref / ref-not-wired / orphan)", () => {
  const baseDir = fixture();
  const voices = {
    Sarah: "./voices/Sarah/Sarah.wav",
    Ghost: null as string | null, // подключён? null = НЕТ... wired=false
    RefOnly: null as string | null,
  };
  const r = status(voices, baseDir);
  assert.deepEqual(r.wiredNoRef, []); // у wired только Sarah, реф есть
  assert.deepEqual(r.refNotWired, ["RefOnly"]);
  assert.deepEqual(r.orphanDirs, ["Orphan"]);
  const sarah = r.layers.find((l) => l.name === "Sarah");
  assert.ok(sarah?.dir && sarah.contract && sarah.wired && sarah.ref);
});

test("planUpdate: новые касты из SPEAKERS без папки (+Narrator, без Generic)", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "sync-plan-"));
  const plan = planUpdate(baseDir);
  assert.ok(plan.newCasts.includes("Narrator"), "Narrator обязателен");
  assert.ok(!plan.newCasts.some((c) => c.startsWith("Generic ")), "Generic-заглушки пропускаются");
  assert.ok(plan.files.includes("Narrator/Narrator.mts"));
});

test("applyUpdate: создаёт папку+подпапки+контракт-заглушку (dry-run не пишет)", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "sync-apply-"));
  const plan = { newCasts: ["Newcomer"], files: [] as string[] };
  // dry-run: ничего не создано (applyUpdate не зван — папки нет).
  assert.equal(existsSync(join(baseDir, "Newcomer")), false);
  const created = applyUpdate(plan, baseDir);
  assert.deepEqual(created, ["Newcomer"]);
  assert.ok(existsSync(join(baseDir, "Newcomer", "gen_selected")));
  assert.ok(existsSync(join(baseDir, "Newcomer", "generated")));
  const stub = readFileSync(join(baseDir, "Newcomer", "Newcomer.mts"), "utf-8");
  assert.match(stub, /export const Newcomer: CastContract/);
  assert.match(stub, /gender: "\?"/);
});

test("contractStub: spaced-имя получает валидный идент и канон name", () => {
  const stub = contractStub("Old Man");
  assert.match(stub, /export const OldMan: CastContract/);
  assert.match(stub, /name: "Old Man"/);
});
