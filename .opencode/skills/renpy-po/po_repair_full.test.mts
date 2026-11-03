/**
 * Тесты po_repair_full: резюме статусов (loadStatesFrom) и классификация строк (classify).
 * LLM-цепочка (chat/judge/writePo) покрыта e2e: po_repair_full_e2e.test.mts (TSSR_PO_E2E=1).
 */
import assert from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { PoEntry } from "./po_core.mts";
import { classify, loadStatesFrom, type State } from "./po_repair_full.mts";

function entry(msgid: string, msgstr = "перевод"): PoEntry {
  return { msgid, msgstr, msgctxt: "", refs: [], comments: [], flags: [], translator: [] };
}

function writeJsonl(rows: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "repair-jsonl-"));
  const p = join(dir, "states.jsonl");
  writeFileSync(p, rows.join("\n"), "utf-8");
  return p;
}

test("loadStatesFrom: последняя запись по msgid побеждает", () => {
  const p = writeJsonl([
    JSON.stringify({ msgid: "a", ok: false, score: 4 }),
    JSON.stringify({ msgid: "a", ok: true, repaired: true, score: 9 }),
    JSON.stringify({ msgid: "b", ok: true, score: 10 }),
  ]);
  const m = loadStatesFrom(p);
  assert.equal(m.size, 2);
  assert.equal(m.get("a")?.repaired, true, "последняя запись должна победить");
  assert.equal(m.get("a")?.ok, true);
  assert.equal(m.get("b")?.score, 10);
});

test("loadStatesFrom: битая строка пропускается, отсутствующий файл → пустая карта", () => {
  const p = writeJsonl(['{"msgid":"ok-row","ok":true}', "{обрыв после крэша", ""]);
  const m = loadStatesFrom(p);
  assert.equal(m.size, 1);
  assert.equal(m.get("ok-row")?.ok, true);
  assert.deepEqual(loadStatesFrom(join(tmpdir(), "no-such-file.jsonl")).size, 0);
});

test("classify: завершённые состояния пропускаются", () => {
  const states = new Map<string, State>([
    ["ok", { ok: true }],
    ["rep", { repaired: true }],
    ["fail", { repair_failed: true }],
    ["human", { human: true }],
  ]);
  const voice = ["ok", "rep", "fail", "human", "new"].map((m) => entry(m));
  const tasks = classify(voice, states);
  assert.equal(tasks.length, 1, "только новая строка");
  assert.equal(tasks[0].kind, "judge");
  assert.equal(tasks[0].entry.msgid, "new");
});

test("classify: голый ok=false → repair с прежним скором (длина строки не влияет)", () => {
  const states = new Map<string, State>([
    ["A long defective translation line here", { ok: false, score: 4, issues: ["semantic error"] }],
    ["Escape", { ok: false, score: 3, issues: ["wrong language"] }],
  ]);
  const voice = [entry("A long defective translation line here"), entry("Escape")];
  const tasks = classify(voice, states);
  assert.equal(tasks.length, 2, "короткая строка тоже идёт в правку");
  assert.equal(tasks[0].kind, "repair");
  assert.equal(tasks[0].prior?.score, 4);
  assert.deepEqual(tasks[0].prior?.issues, ["semantic error"]);
  assert.equal(tasks[1].entry.msgid, "Escape");
  assert.equal(tasks[1].kind, "repair");
});

test("classify: repair идёт перед judge, дубли msgid не плодятся", () => {
  const states = new Map<string, State>([["defect line number one here", { ok: false, score: 5 }]]);
  const voice = [
    entry("brand new line without any state at all"),
    entry("defect line number one here"),
    entry("defect line number one here"), // дубль
    entry("another brand new line here"),
  ];
  const tasks = classify(voice, states);
  assert.equal(tasks.length, 3, "дубль msgid схлопнут");
  assert.equal(tasks[0].kind, "repair", "правки первыми");
  assert.equal(tasks[1].kind, "judge");
  assert.equal(tasks[2].kind, "judge");
});
