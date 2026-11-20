/**
 * voice_corpus.test.mts — инварианты РЕАЛЬНОГО корпуса `audio/` после миграции.
 *
 * Отвечает на вопрос «точно все файлы мигрированы?» тестом, а не глазами:
 *   1. каждый файл либо по целевой схеме, либо документированное легаси;
 *   2. имена предыдущих схем (hex `{en16}__{state8}__`) — НОЛЬ: рантайм их не находит;
 *   3. `en12` совпадает с base32(md5(английского оригинала))[:12] (так его ищет рантайм);
 *   4. голос есть в кастах;
 *   5. нет файлов «вне POT»;
 *   6. нет двойных имён (одна реплика и легаси-именем, и целевым) — иначе глоб
 *      рантайма возьмёт первое по алфавиту;
 *   7. нет дублей имён внутри папки;
 *   8. самый длинный путь в архиве ≤ 240 символов (запас до MAX_PATH 260).
 *
 * Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/voice_corpus.test.mts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { parsePo } from "../../../../../.opencode/skills/renpy-po/po_core.mts";
import { VOICES } from "../../../casts/voices.mts";
import { enHash, hexEnHash, parseAnyVoiceName, voiceFileName } from "./voice_names.mts";

const AUDIO = join("patches", "ai-voice-pack", "audio");
const POT = join("patches", "ai-voice-pack", "po", "template.pot");
/** Путь в распакованной установке (раскладка архива = раскладка установки). */
const INSTALL_PREFIX = "mods/tssr-ai-voice-pack/ai_voice/";
const MAX_INSTALL_PATH = 240;

const md5 = (s: string): string => createHash("md5").update(s, "utf8").digest("hex");

/**
 * Оригинал по любому из префиксов: en12 (нынешняя схема), en16 (hex-переход),
 * uid32 (легаси). Парсим каноническим parsePo: наивный regex терял
 * МНОГОСТРОЧНЫЕ msgid (длинные реплики) и давал ложные «не найден в POT».
 */
const byPrefix = new Map<string, { en: string; emotion: string }>();
for (const e of parsePo(readFileSync(POT, "utf-8").replace(/\r\n/g, "\n"))) {
  if (!e.msgid) continue;
  const emotion = (
    e.comments.find((c) => c.startsWith("emotion_new:")) ??
    e.comments.find((c) => c.startsWith("emotion:")) ??
    ""
  )
    .replace(/^emotion(_new)?:\s*/, "")
    .trim();
  const src = { en: e.msgid, emotion };
  byPrefix.set(enHash(e.msgid), src);
  byPrefix.set(hexEnHash(e.msgid), src);
  byPrefix.set(md5(e.msgid), src);
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

test("корпус: КАЖДЫЙ файл по контракту {en12}-{state6} {variant} (легаси = 0)", () => {
  const modern: string[] = [];
  const hex: string[] = [];
  const legacy: string[] = [];
  const weird: string[] = [];
  for (const f of files) {
    const parsed = parseAnyVoiceName(f.name);
    if (!parsed) weird.push(f.rel);
    else if (parsed.scheme === "base32") modern.push(f.rel);
    else if (parsed.scheme === "hex") hex.push(f.rel);
    else legacy.push(f.rel);
  }
  assert.deepEqual(weird, [], `файлы с непонятным именем: ${weird.slice(0, 5).join(", ")}`);
  assert.deepEqual(hex, [], `не мигрировано (hex-схема): ${hex.length}, напр. ${hex.slice(0, 3).join(", ")}`);
  // ЛЕГАСИ = 0, а не «< 300»: допуск скрыл инцидент 2026-11-20, когда стенд
  // писал в корпус `{uid}__{voice}__Vox...` — игра таких файлов не находит,
  // а счётчики показывали прогресс. Любое имя не по контракту — падение.
  assert.deepEqual(
    legacy,
    [],
    `файлы не по контракту: ${legacy.length}, напр. ${legacy.slice(0, 3).join(", ")} — ` +
      "в корпус пишет только voice_batch --engine voxcpm2 (стенд — в output/voxbench)",
  );
  assert.ok(modern.length > 12_000, `целевой схемы подозрительно мало: ${modern.length}`);
  console.log(
    `  целевая схема: ${modern.length} | hex: ${hex.length} | легаси: ${legacy.length} | всего: ${files.length}`,
  );
});

test("корпус: en12 совпадает с base32(md5(английского оригинала)) — так его ищет рантайм", () => {
  const bad: string[] = [];
  for (const f of files) {
    const parsed = parseAnyVoiceName(f.name);
    if (!parsed || parsed.scheme !== "base32") continue;
    const src = byPrefix.get(parsed.en);
    if (!src) {
      bad.push(`${f.rel}: en12 не найден в POT`);
      continue;
    }
    if (enHash(src.en) !== parsed.en) bad.push(`${f.rel}: префикс не совпал`);
  }
  assert.deepEqual(bad, [], bad.slice(0, 5).join("\n"));
});

test("корпус: голос каждого файла есть в кастах", () => {
  const known = new Set([...Object.keys(VOICES), "Narrator"]);
  const bad: string[] = [];
  for (const f of files) {
    const parsed = parseAnyVoiceName(f.name);
    if (!parsed) continue;
    if (!known.has(parsed.variant)) bad.push(`${f.rel}: голос «${parsed.variant}» не из кастов`);
  }
  assert.deepEqual(bad, [], bad.slice(0, 5).join("\n"));
});

test("корпус: нет файлов без строки в POT", () => {
  const orphans: string[] = [];
  for (const f of files) {
    const parsed = parseAnyVoiceName(f.name);
    if (!parsed) continue;
    if (!byPrefix.has(parsed.en)) orphans.push(f.rel);
  }
  assert.deepEqual(orphans, [], `файлов вне POT: ${orphans.length}\n${orphans.slice(0, 5).join("\n")}`);
});

test("корпус: одна реплика не лежит сразу под легаси-именем и под целевым", () => {
  // Поймано 2026-11-17: 62 файла существовали в двух экземплярах (миграция
  // перенесла, а старые имена вернулись после сбоя со стешем). Содержимое было
  // идентично, но рантайм по глобу `{en12}*` брал первое по алфавиту.
  // Легаси-имя поднимаем до целевого через POT (uid32 → EN → en12).
  const byArc = new Map<string, Set<string>>();
  for (const f of files) {
    const dir = f.rel.slice(0, f.rel.lastIndexOf("/"));
    const set = byArc.get(dir) ?? new Set<string>();
    set.add(f.name);
    byArc.set(dir, set);
  }
  const dupes: string[] = [];
  for (const f of files) {
    const parsed = parseAnyVoiceName(f.name);
    if (!parsed || parsed.scheme !== "uid32") continue;
    const src = byPrefix.get(parsed.en);
    if (!src) continue;
    const target = voiceFileName({ en: src.en, variant: parsed.variant, spoken: src.en, emotion: src.emotion });
    const dir = f.rel.slice(0, f.rel.lastIndexOf("/"));
    if (byArc.get(dir)?.has(target)) dupes.push(`${dir}: ${f.name} ↔ ${target}`);
  }
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

test("корпус: самый длинный путь в архиве ≤ 240 символов (запас до MAX_PATH)", () => {
  let worst = { path: "", len: 0 };
  for (const f of files) {
    const p = INSTALL_PREFIX + f.rel;
    if (p.length > worst.len) worst = { path: p, len: p.length };
  }
  assert.ok(worst.len <= MAX_INSTALL_PATH, `путь ${worst.len} символов: ${worst.path}`);
  console.log(`  самый длинный путь: ${worst.len} (запас ${MAX_INSTALL_PATH - worst.len})`);
});
