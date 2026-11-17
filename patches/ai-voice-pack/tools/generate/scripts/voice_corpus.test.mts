/**
 * voice_corpus.test.mts — инварианты РЕАЛЬНОГО корпуса `audio/` после миграции.
 *
 * Отвечает на вопрос «точно все файлы мигрированы?» тестом, а не глазами:
 *   1. каждый файл либо по новой схеме, либо документированное легаси;
 *   2. `en16` совпадает с md5(английского оригинала)[:16] (так его ищет рантайм);
 *   3. голос есть в кастах;
 *   4. нет файлов «вне POT»;
 *   5. нет двойных имён (один uid и под легаси, и под новым) — иначе глоб рантайма
 *      возьмёт легаси-имя, потому что `1` сортируется раньше `_`;
 *   6. нет дублей имён внутри папки.
 *
 * Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/voice_corpus.test.mts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { parsePo } from "../../../../../.opencode/skills/renpy-po/po_core.mts";
import { VOICES } from "../../../casts/voices.mts";
import { parseVoiceName } from "./voice_names.mts";

const AUDIO = join("patches", "ai-voice-pack", "audio");
const POT = join("patches", "ai-voice-pack", "po", "template.pot");
const md5 = (s: string): string => createHash("md5").update(s, "utf8").digest("hex");

/**
 * en16 → английский оригинал. Парсим каноническим parsePo: наивный regex терял
 * МНОГОСТРОЧНЫЕ msgid (длинные реплики) и давал ложные «не найден в POT».
 */
const byEn16 = new Map<string, string>();
for (const e of parsePo(readFileSync(POT, "utf-8").replace(/\r\n/g, "\n"))) {
  if (!e.msgid) continue;
  byEn16.set(md5(e.msgid).slice(0, 16), e.msgid);
}

const files: Array<{ rel: string; name: string }> = [];
const walk = (dir: string, rel = ""): void => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, `${rel}${f}/`);
    else if (f.endsWith(".opus") || f.endsWith(".wav")) files.push({ rel: `${rel}${f}`, name: f });
  }
};
walk(AUDIO);

test("корпус: каждый файл по новой схеме или документированное легаси", () => {
  const modern: string[] = [];
  const legacy: string[] = [];
  const weird: string[] = [];
  for (const f of files) {
    if (parseVoiceName(f.name)) modern.push(f.rel);
    else if (/^[0-9a-f]{32}__.+\.(?:opus|wav)$/.test(f.name)) legacy.push(f.rel);
    else weird.push(f.rel);
  }
  assert.deepEqual(weird, [], `файлы с непонятным именем: ${weird.slice(0, 5).join(", ")}`);
  assert.ok(modern.length > 12_000, `новой схемы подозрительно мало: ${modern.length}`);
  // Легаси остались только там, где на момент генерации перевода в po не было.
  assert.ok(legacy.length < 300, `легаси слишком много: ${legacy.length}`);
  console.log(`  новая схема: ${modern.length} | легаси: ${legacy.length} | всего: ${files.length}`);
});

test("корпус: en16 совпадает с md5(английского оригинала)[:16] — так его ищет рантайм", () => {
  const bad: string[] = [];
  for (const f of files) {
    const parsed = parseVoiceName(f.name);
    if (!parsed) continue;
    const en = byEn16.get(parsed.en16);
    if (!en) {
      bad.push(`${f.rel}: en16 не найден в POT`);
      continue;
    }
    if (md5(en).slice(0, 16) !== parsed.en16) bad.push(`${f.rel}: префикс не совпал`);
  }
  assert.deepEqual(bad, [], bad.slice(0, 5).join("\n"));
});

test("корпус: голос каждого файла есть в кастах", () => {
  const known = new Set([...Object.keys(VOICES), "Narrator"]);
  const bad: string[] = [];
  for (const f of files) {
    const parsed = parseVoiceName(f.name);
    if (!parsed) continue;
    if (!known.has(parsed.variant)) bad.push(`${f.rel}: голос «${parsed.variant}» не из кастов`);
  }
  assert.deepEqual(bad, [], bad.slice(0, 5).join("\n"));
});

test("корпус: нет файлов без строки в POT", () => {
  const orphans: string[] = [];
  for (const f of files) {
    const parsed = parseVoiceName(f.name);
    const uid16 = parsed ? parsed.en16 : (/^([0-9a-f]{32})__/.exec(f.name)?.[1]?.slice(0, 16) ?? "");
    if (!uid16) continue;
    if (!byEn16.has(uid16)) orphans.push(f.rel);
  }
  assert.deepEqual(orphans, [], `файлов вне POT: ${orphans.length}\n${orphans.slice(0, 5).join("\n")}`);
});

test("корпус: один uid не лежит сразу и под легаси-именем, и под новым", () => {
  // Поймано 2026-11-17: 62 файла существовали в двух экземплярах (миграция
  // перенесла, а старые имена вернулись после сбоя со стешем). Содержимое было
  // идентично, но рантайм по глобу `{uid16}*` брал ЛЕГАСИ-имя (сортируется раньше).
  const byUid = new Map<string, { modern: number; legacy: number }>();
  for (const f of files) {
    const legacy = /^([0-9a-f]{32})__/.exec(f.name);
    const modern = /^([0-9a-f]{16})__[0-9a-f]{8}__/.exec(f.name);
    const prefix = legacy ? legacy[1]!.slice(0, 16) : modern ? modern[1]! : "";
    if (!prefix) continue;
    const dir = f.rel.slice(0, f.rel.lastIndexOf("/"));
    const key = `${dir}/${prefix}`;
    const row = byUid.get(key) ?? { modern: 0, legacy: 0 };
    if (legacy) row.legacy++;
    else row.modern++;
    byUid.set(key, row);
  }
  const dupes = [...byUid.entries()].filter(([, v]) => v.legacy && v.modern).map(([k]) => k);
  assert.deepEqual(dupes, [], `двойные имена: ${dupes.slice(0, 5).join(", ")}`);
});

test("корпус: одинаковых имён в одной папке нет", () => {
  const dupes: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const key = f.rel.toLowerCase(); // Windows регистронезависим
    if (seen.has(key)) dupes.push(f.rel);
    seen.add(key);
  }
  assert.deepEqual(dupes, [], dupes.slice(0, 5).join("\n"));
});

void existsSync;
