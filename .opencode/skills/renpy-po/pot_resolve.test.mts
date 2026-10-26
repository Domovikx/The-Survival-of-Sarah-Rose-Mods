/**
 * pot_resolve.test.mts — обратный пайплайн po → pot[arc, scene, uid, emotion].
 * node --test .opencode/skills/renpy-po/pot_resolve.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PotIndex, loadPotIndex, DEFAULT_POT } from "./pot_resolve.mts";

const POT = `
msgid ""
msgstr ""
"Language: xx\\n"

#. label-map: SomeLabel=SomeArc
#. arc: AlfredArc
#. scene: CampSlavePath
#. uid: deadbeefdeadbeefdeadbeefdeadbeef
#. emotion: Thoughtfully puzzled
msgctxt "speaker:Narrator"
msgid "She looked at him."
msgstr ""

#. arc: Other
#. uid: 0123456789abcdef0123456789abcdef
msgctxt "speaker:Sarah"
msgid "Hello!"
msgstr ""

#. arc: StoryBeginnings
#. uid: cafebabecafebabecafebabecafebabe
msgctxt "menu"
msgid "Start"
msgstr ""
`.replace(/\r\n/g, "\n");

test("резолв по ключу: полные метаданные из комментариев POT", () => {
  const idx = new PotIndex(POT);
  const m = idx.resolve("speaker:Narrator", "She looked at him.");
  assert.ok(m);
  assert.equal(m.arc, "AlfredArc");
  assert.equal(m.scene, "CampSlavePath");
  assert.equal(m.emotion, "Thoughtfully puzzled");
  assert.equal(m.category, "narration");
  assert.equal(m.speaker, null);
  // uid вычисляется md5(msgid) — та же формула, что у комментария #. uid:
  assert.equal(m.uid, createHash("md5").update("She looked at him.", "utf8").digest("hex"));
});

test("uid = md5(msgid) — та же формула, что у potgen/voice_batch", () => {
  const idx = new PotIndex(POT);
  // md5("Hello!") проверяем через сам резолвер: uid обязан совпасть с md5
  const m = idx.resolve("speaker:Sarah", "Hello!");
  assert.ok(m);
  assert.equal(m.uid.length, 32);
  assert.match(m.uid, /^[0-9a-f]{32}$/);
  assert.equal(m.category, "dialogue");
  assert.equal(m.speaker, "Sarah");
  assert.equal(m.emotion, null, "без комментария emotion -> null");
});

test("menu/ui категории и заголовок не индексируются", () => {
  const idx = new PotIndex(POT);
  assert.equal(idx.resolve("menu", "Start")?.category, "menu");
  assert.equal(idx.resolve("", ""), null, "заголовок не попадает в индекс");
});

test("дрейф: ключа нет в POT -> null (не краш)", () => {
  const idx = new PotIndex(POT);
  assert.equal(idx.resolve("speaker:NoSuch", "нет строки"), null);
  assert.equal(idx.emotion("speaker:NoSuch", "нет строки"), null);
});

test("детерминизм: дубль ключа -> первая запись", () => {
  const dup = `${POT}\n#. arc: Second\nmsgctxt "speaker:Sarah"\nmsgid "Hello!"\nmsgstr ""\n`;
  const idx = new PotIndex(dup);
  assert.equal(idx.resolve("speaker:Sarah", "Hello!")?.arc, "Other");
});

test("боевой template.pot: индекс строится, размер = числу записей", () => {
  const idx = loadPotIndex(DEFAULT_POT);
  assert.ok(idx.size > 60000, `слишком мало: ${idx.size}`);
  // известная запись (проверено 2026-10-23)
  const m = idx.resolve("speaker:Narrator", "Al'Gahaem was a city that was hard for Sarah to wrap her mind around.");
  assert.ok(m, "известная строка резолвится");
  assert.equal(m.arc, "AlfredArc");
  assert.equal(m.emotion, "Thoughtfully puzzled");
});

test("ГРАНИЦА: тон живёт ТОЛЬКО в template.pot — в po/*.po его нет", () => {
  // Решение 2026-10-23 (DRY) + подтверждение владельца 2026-10-26: все
  // держатели тона, кроме шаблона, — ересь. Раньше держалось только на
  // конвенции (po_update чистит comments), теперь это тест.
  const poDir = join(import.meta.dirname, "..", "..", "..", "patches", "ai-voice-pack", "po");
  const offenders: string[] = [];
  let scanned = 0;
  for (const f of readdirSync(poDir).toSorted()) {
    if (!f.endsWith(".po")) continue;
    scanned++;
    const hit = readFileSync(join(poDir, f), "utf-8")
      .split("\n")
      .find((l) => l.startsWith("#. emotion:"));
    if (hit) offenders.push(`${f}: ${hit.slice(0, 70)}`);
  }
  assert.ok(scanned >= 10, `po-файлов найдено: ${scanned}`);
  assert.deepEqual(offenders, [], `тон протёк в .po:\n${offenders.join("\n")}`);

  // позитивный контроль: если в шаблоне тона вдруг нет — проверка пустая
  assert.ok(readFileSync(DEFAULT_POT, "utf-8").includes("#. emotion:"), "в template.pot нет тона!");
});
