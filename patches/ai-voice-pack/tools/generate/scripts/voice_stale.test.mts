/**
 * voice_stale.test.mts — E2E механизма обнаружения «надо перегенерировать».
 *
 * Гоняет НАСТОЯЩИЙ voice_stale.mts на синтетическом корпусе (tmp/, настоящий не
 * трогаем) и проверяет все классы:
 *   OK / STALE (текст) / STALE (тон) / OK при смене разметки /
 *   NO-TRANSLATION (перевод опустел) / ORPHAN (изменился английский) / LEGACY
 *
 * Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/voice_stale.test.mts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { voiceFileName } from "./voice_names.mts";

const ROOT = join("tmp", "e2e-voice-stale");
const LANG = "xx";
const ARC = "TestArc";
const SCRIPT = resolve("patches/ai-voice-pack/tools/generate/scripts/voice_stale.mts");

const EN_OK = "This line never changes.";
const EN_TEXT = "This line was retranslated.";
const EN_TONE = "This line keeps its text, only the tone changes.";
const EN_TAG = "This line gets markup around it.";
const EN_EMPTY = "This line loses its translation.";
const EN_ORPHAN = "The English text here will change.";
const EN_LEGACY = "This one has an old-style name.";

/** POT-запись с тоном (комментарии стоят ПЕРЕД своей записью). */
const potEntry = (en: string): string =>
  ["#. arc: TestArc", "#. emotion: Calm", 'msgctxt "speaker:Narrator"', `msgid "${en}"`, ""].join("\n");

const pot = [
  'msgid ""',
  'msgstr ""',
  "",
  ...[EN_OK, EN_TEXT, EN_TONE, EN_TAG, EN_EMPTY, EN_ORPHAN, EN_LEGACY].map(potEntry),
].join("\n");

const poEntry = (en: string, tr: string): string =>
  ['msgctxt "speaker:Narrator"', `msgid "${en}"`, `msgstr "${tr}"`, ""].join("\n");

const po = [
  'msgid ""',
  'msgstr ""',
  "",
  poEntry(EN_OK, "Эта строка не меняется."),
  poEntry(EN_TEXT, "Эту строку ПЕРЕВЕЛИ ИНАЧЕ."),
  poEntry(EN_TONE, "Текст тот же."),
  poEntry(EN_TAG, "{i}Этот текст получил разметку.{/i}"),
  poEntry(EN_EMPTY, ""),
  poEntry(EN_ORPHAN, "Английский изменился."),
  poEntry(EN_LEGACY, "Это старое имя."),
].join("\n");

test("E2E: voice_stale различает все классы (текст / тон / пусто / сирота / легаси)", () => {
  rmSync(ROOT, { recursive: true, force: true });
  const audioDir = join(ROOT, "audio");
  const poDir = join(ROOT, "po");
  const arcDir = join(audioDir, LANG, ARC);
  mkdirSync(arcDir, { recursive: true });
  mkdirSync(poDir, { recursive: true });
  writeFileSync(join(ROOT, "template.pot"), pot, "utf-8");
  writeFileSync(join(poDir, `${LANG}.po`), po, "utf-8");

  const put = (name: string): void => writeFileSync(join(arcDir, name), "x", "utf-8");

  // 1. OK: имя по актуальному состоянию
  put(voiceFileName({ en: EN_OK, variant: "Narrator", spoken: "Эта строка не меняется.", emotion: "Calm" }));
  // 2. STALE по тексту: имя от старого перевода
  put(voiceFileName({ en: EN_TEXT, variant: "Narrator", spoken: "Старая формулировка.", emotion: "Calm" }));
  // 3. STALE по тону: текст тот же, тон был Angry
  put(voiceFileName({ en: EN_TONE, variant: "Narrator", spoken: "Текст тот же.", emotion: "Angry" }));
  // 4. OK при разметке: хэш считается по очищенному тексту
  put(voiceFileName({ en: EN_TAG, variant: "Narrator", spoken: "Этот текст получил разметку.", emotion: "Calm" }));
  // 5. NO-TRANSLATION: перевод в po пуст, файл остался
  put(voiceFileName({ en: EN_EMPTY, variant: "Narrator", spoken: "Перевод был, теперь его нет.", emotion: "Calm" }));
  // 6. ORPHAN: файл для старого английского текста
  put(
    voiceFileName({ en: `${EN_ORPHAN} (old)`, variant: "Narrator", spoken: "Английский изменился.", emotion: "Calm" }),
  );
  // 7. LEGACY: имя старой схемы (uid есть в POT)
  put(`${createHash("md5").update(EN_LEGACY, "utf8").digest("hex")}__Narrator.opus`);

  const reportPath = join(ROOT, "stale.json");
  const out = execFileSync(process.execPath, ["--experimental-strip-types", SCRIPT, "--lang", LANG], {
    env: {
      ...process.env,
      TSSR_AUDIO_DIR: audioDir,
      TSSR_POT: join(ROOT, "template.pot"),
      TSSR_PO_DIR: poDir,
      TSSR_STALE_JSON: reportPath,
    },
    encoding: "utf-8",
  });

  const rows = JSON.parse(readFileSync(reportPath, "utf-8")) as Array<{ file: string; cls: string }>;
  const counts = rows.reduce<Record<string, number>>((acc, r) => ((acc[r.cls] = (acc[r.cls] ?? 0) + 1), acc), {});
  console.log("классы:", counts);

  assert.equal(rows.length, 7, `должно быть 7 файлов:\n${out}`);
  assert.equal(counts.OK, 2, "OK: неизменённая строка и строка с разметкой (разметка снимается до хэша)");
  assert.equal(counts.STALE, 2, "STALE: правка перевода и правка тона");
  assert.equal(counts["NO-TRANSLATION"], 1, "NO-TRANSLATION: перевод опустел");
  assert.equal(counts.ORPHAN, 1, "ORPHAN: английский текст изменился");
  assert.equal(counts.LEGACY, 1, "LEGACY: имя старой схемы");

  rmSync(ROOT, { recursive: true, force: true });
});
