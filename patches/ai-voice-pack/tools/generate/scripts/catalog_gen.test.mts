/**
 * Тесты сборочного генератора рантайм-каталога (label_arc/voice_list из
 * POT + кастов; в git каталог не коммитится — см. catalog_gen.mts).
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildLabelArc, buildVoiceList, generate, POT_FILE } from "./catalog_gen.mts";

const FIXTURE_POT = `# TSSR EN template (fixture).
msgid ""
msgstr ""
"Project-Id-Version: TSSR-Mods 1.0\\n"

#. label-map: OpeningSceneFirstMorning=Prologue
#. label-map: MercenaryQueen1=UnionKingdom
#. label-map: Demonarc4=Other
#. label-map: VargaPath5=VargaMarionPath
#. arc: Prologue
#. scene: OpeningSceneFirstMorning
#. uid: aabbccdd00112233445566778899aabb
#. emotion: Curiously observing
msgctxt "speaker:Sarah"
msgid "Hello there!"
msgstr ""
`;

function fixturePot(): string {
  const dir = mkdtempSync(join(tmpdir(), "catgen-"));
  const p = join(dir, "template.pot");
  writeFileSync(p, FIXTURE_POT, "utf-8");
  return p;
}

test("buildLabelArc: разбирает label-map, сортирует ключи", () => {
  const map = buildLabelArc(fixturePot(), 1);
  assert.deepEqual(Object.keys(map), ["Demonarc4", "MercenaryQueen1", "OpeningSceneFirstMorning", "VargaPath5"]);
  assert.equal(map["OpeningSceneFirstMorning"], "Prologue");
  assert.equal(map["Demonarc4"], "Other");
});

test("buildLabelArc: битая строка label-map — фатальная ошибка", () => {
  const dir = mkdtempSync(join(tmpdir(), "catgen-"));
  const p = join(dir, "template.pot");
  writeFileSync(p, "#. label-map: без_знака_равенства\n", "utf-8");
  assert.throws(() => buildLabelArc(p), /битая строка label-map/);
});

test("buildLabelArc: нет файла — фатальная ошибка с намёком на potgen", () => {
  assert.throws(() => buildLabelArc(join(tmpdir(), "no-such.pot")), /npm run potgen/);
});

test("buildLabelArc: пуст инвентарь — фатальная ошибка (не пишем пустую мапу)", () => {
  const dir = mkdtempSync(join(tmpdir(), "catgen-"));
  const p = join(dir, "template.pot");
  writeFileSync(p, 'msgid ""\nmsgstr ""\n', "utf-8");
  assert.throws(() => buildLabelArc(p), /почти пуст/);
});

test("buildVoiceList: names = озвученные (VOICES непустые), narrator = Narrator", () => {
  const vl = buildVoiceList() as { names: Record<string, string>; narrator: string };
  assert.equal(vl.narrator, "Narrator");
  assert.equal(vl.names["Narrator"], "Narrator");
  const keys = Object.keys(vl.names);
  assert.ok(keys.length >= 10, `голосов: ${keys.length}`);
  // Идентичность variant = имя (контракт voice_config.rpy).
  for (const k of keys.slice(0, 5)) assert.equal(vl.names[k], k);
  // Ключи отсортированы — детерминизм сборки.
  assert.deepEqual(keys, [...keys].sort());
});

test("generate: пишет оба JSON с валидным содержимым", () => {
  const dir = mkdtempSync(join(tmpdir(), "catgen-out-"));
  const r = generate(dir);
  const arc = JSON.parse(readFileSync(r.labelArc, "utf-8")) as Record<string, string>;
  const vl = JSON.parse(readFileSync(r.voiceList, "utf-8")) as Record<string, unknown>;
  assert.ok(Object.keys(arc).length >= 100, `label_arc: ${Object.keys(arc).length}`);
  assert.ok(vl["names"] && vl["narrator"], "voice_list: names+narrator");
});

test("e2e-факт: реальный POT несёт инвентарь с документированными фиксами", () => {
  const map = buildLabelArc(POT_FILE);
  const n = Object.keys(map).length;
  assert.ok(n >= 240, `лейблов: ${n}`);
  assert.equal(map["VargaPath5"], "VargaMarionPath", "фикс артефакта (был Prologue)");
  assert.equal(map["TrainingPathKate3"], "Training", "фикс артефакта (был Other)");
  assert.equal(map["prostitutealaric1"], "Other", "лейбл, не досчитанный прежним тл-сканом");
  assert.equal(map["Demonarc4"], "Other", "case-sensitivity: Demonarc4 ≠ DemonArc");
});
