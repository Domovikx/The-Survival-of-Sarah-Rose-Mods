/**
 * Проба судьи на Index-Translate-9B (2026-11-04, по запросу владельца).
 * Набор: 64 заведомо дефектных перевода (БЫЛО из improve-лога — до наших правок)
 * + 20 чистых строк текущего po. Судья: EN+RU → {"verdict":"ok"|"bad","reason"}.
 * temperature0. Только JSON, без стиля — ловим грубые ляпы.
 * Запуск: node tmp/judge_probe.mts
 */
import { readFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

import { charsOf, judgeLine } from "./judge_client.mts";

const PO = "patches/ai-voice-pack/po/ru.po";

// 1. Дефектные пары: БЫЛО из improve-лога для индексов, которые мы починили.
const log = readFileSync("tmp/translate_ru.improve.log", "utf-8");
const blocks = log.split(/^\[изменено /m).slice(1);
const badOld = new Map<number, string>();
for (const b of blocks) {
  const idx = Number(/^(\d+)\]/.exec(b)?.[1]);
  const m = /^   БЫЛО:\s+(.*)$/m.exec(b);
  if (Number.isFinite(idx) && m) badOld.set(idx, m[1]);
}
const FIXED = [97,174,289,316,370,440,521,594,624,671,672,674,792,803,804,809,858,929,975,1638,2076,2141,2568,2611,2688,3743,5333,5434,5442,5445,7377,9253,9571,9883,9885,10426,10725,10951,11408,11621,13015,13248,13947,15054,15311,15480,16180,16365,16684,16789,17153,17155,17224,17412,17500,695,9434,9435,10499,14260,14604,5370,13202,17330];

const entries = parsePo(readFileSync(PO, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);

// Канон имён + пол — судья получает CHARACTERS из него (общий charsOf).
const NAME_CANON = new Map<string, string>();
for (const e of entries) {
  if (e.msgctxt === "speaker-name" && e.msgid && e.msgstr.trim() && !NAME_CANON.has(e.msgid)) NAME_CANON.set(e.msgid, e.msgstr.trim());
}

// 2. Чистые: равномерная выборка текущего po (аудиты уже чистые; случайные).
const CLEAN_N = Number(process.env.CLEAN_N ?? 20);
const STRIDE = Number(process.env.CLEAN_STRIDE ?? 3400);
const clean: Array<{ i: number; e: (typeof entries)[number] }> = [];
for (let i = 100; clean.length < CLEAN_N && i < entries.length; i += STRIDE) {
  const e = entries[i];
  if (e.msgctxt === "speaker-name" || !e.msgstr || FIXED.includes(i)) continue;
  clean.push({ i, e });
}

// 3. Судья — общий клиент (judge_client): единый источник промпта.
// Температура/вариант промпта — оси для E2E-проб: сравниваем пойманные
// дефекты и ложные флаги, оставляем лучшую (правило владельца: проба и ошибка).
const TEMP = Number(process.env.JUDGE_TEMP ?? "0");
const VARIANT = process.env.JUDGE_VARIANT ?? "v10";
const VERIFY = process.env.JUDGE_VERIFY === "1";
const judge = (en: string, ru: string, chars: string): Promise<{ v: string; r: string } | null> =>
  judgeLine(en, ru, "ru", chars, TEMP, VARIANT, VERIFY);

let tp = 0, fn = 0, parseFail = 0;
console.log("=== ДЕФЕКТНЫЕ (ждём bad) ===");
for (const i of FIXED) {
  const ru = badOld.get(i);
  const e = entries[i];
  if (!ru || !e) continue;
  const j = await judge(e.msgid, ru, charsOf(e.msgctxt, e.msgid, NAME_CANON));
  if (!j) { parseFail++; console.log(`[${i}] НЕ РАЗОБРАНО: ${ru.slice(0, 70)}`); continue; }
  if (j.v === "bad") tp++;
  else fn++;
  console.log(`[${i}] ${j.v.toUpperCase()}${j.v === "ok" ? " ← ПРОПУСК" : ""} | ${j.r} | ${ru.slice(0, 55)}`);
}
console.log(`\nДефектных поймано: ${tp}/${tp + fn}, не разобрано: ${parseFail}`);

console.log("\n=== ЧИСТЫЕ (ждём ok; bad — проверяю глазами) ===");
let fp = 0;
for (const c of clean) {
  const j = await judge(c.e.msgid, c.e.msgstr, charsOf(c.e.msgctxt, c.e.msgid, NAME_CANON));
  if (!j) { console.log(`[${c.i}] НЕ РАЗОБРАНО`); continue; }
  if (j.v === "bad") { fp++; console.log(`[${c.i}] BAD ← флаг: ${j.r} | ${c.e.msgstr.slice(0, 60)}`); }
}
console.log(`\nЛожных флагов на чистых: ${fp}/${clean.length}`);
