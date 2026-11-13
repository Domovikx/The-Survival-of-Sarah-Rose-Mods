/**
 * Судья для свежих переводов: берёт последние N индексов из translate_<lang>.live.log,
 * читает ПОЛНЫЙ EN и текущий перевод из po, судит (V4: пол персонажей в SYSTEM,
 * temp0 — лучшая конфигурация по E2E-пробам 2026-11-04: 58/64, 0 ложных).
 * Ничего не применяет — только флаги для подтверждения агентом.
 * Запуск: node .opencode/skills/translate/translate_judge.mts [lang] [n]
 */
import { readFileSync } from "node:fs";

import { parsePo } from "../../../.opencode/skills/renpy-po/po_core.mts";

import { charsOf, judgeLine } from "./judge_client.mts";

const LANG = process.argv[2] ?? "ru";
const N = Number(process.argv[3] ?? 50);
// --spread: не хвост лога, а равномерная выборка ПО ВСЕМУ корпусу
// (перепроверка переведённого целиком, а не последнего пачки).
const SPREAD = process.argv.includes("--spread");
// Фаза среза — чтобы волны не повторяли одни и те же строки.
const PHASE = Number(process.env.JUDGE_PHASE ?? 0);
// --file <path>: судить индексы из файла (по одному на строку) — например,
// список УТЕЧКА из translate_review --all.
const fileArg = process.argv.indexOf("--file");
const FILE = fileArg >= 0 ? process.argv[fileArg + 1] : null;
// --variant <v10|v11|...>: промпт судьи. Для аудита правок регистра — v13
// (v10 без оговорки про словарь книги считает «киску» выдумкой).
const variantArg = process.argv.indexOf("--variant");
const VARIANT = variantArg >= 0 ? (process.argv[variantArg + 1] ?? "v10") : "v10";
const PO = `patches/ai-voice-pack/po/${LANG}.po`;
const LIVE = `tmp/translate_${LANG}.live.log`;

const entries = parsePo(readFileSync(PO, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);

// Индексы для суда: файл, хвост лога прогона или сплошная выборка по корпусу.
let tail: number[];
if (FILE) {
  tail = [...new Set(readFileSync(FILE, "utf-8").split(/\s+/).map(Number).filter(Number.isFinite))];
} else if (SPREAD) {
  const done: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.msgid && e.msgstr && e.msgctxt !== "speaker-name") done.push(i);
  }
  const stride = Math.max(1, Math.floor(done.length / N));
  tail = done.filter((_, k) => k % stride === PHASE).slice(0, N);
} else {
  const live = readFileSync(LIVE, "utf-8");
  const idxList = [...live.matchAll(/^\[изменено (\d+)\]/gm)].map((m) => Number(m[1]));
  tail = [...new Set(idxList)].slice(-N);
}
const NAME_CANON = new Map<string, string>();
for (const e of entries) {
  if (e.msgctxt === "speaker-name" && e.msgid && e.msgstr.trim() && !NAME_CANON.has(e.msgid))
    NAME_CANON.set(e.msgid, e.msgstr.trim());
}
const charsOfEntry = (e: (typeof entries)[number]): string => charsOf(e.msgctxt, e.msgid, NAME_CANON);

// Ложные срабатывания судьи НЕ хардкодим (правило владельца 2026-11-06:
// тюнинг промпта через E2E, а не списки индексов — списки ещё и ломают другие
// языки). Известные упрямые FP фиксируются в журнале задачи.

if (!tail.length) {
  console.log(`СУДЬЯ: нет свежих строк в ${LIVE}`);
  process.exit(0);
}
console.log(`СУДЬЯ: старт ${new Date().toISOString()} | строк к суду: ${tail.length}`);
const t0 = Date.now();
let processed = 0;
let bad = 0,
  fail = 0;
for (const i of tail) {
  const e = entries[i];
  if (!e || !e.msgstr) continue;
  const j = await judgeLine(e.msgid, e.msgstr, LANG, charsOfEntry(e), 0, VARIANT);
  processed++;
  if (!j) {
    fail++;
    continue;
  }
  if (j.v === "bad") {
    bad++;
    console.log(`СУДЬЯ-BAD [${i}] ${j.r}`);
    console.log(`   EN: ${e.msgid.slice(0, 110)}`);
    console.log(`   TR: ${e.msgstr.slice(0, 140)}`);
  }
  if (processed % 500 === 0) {
    const sec = (Date.now() - t0) / 1000;
    const eta = Math.round(((sec / processed) * (tail.length - processed)) / 60);
    console.log(
      `[ПРОГРЕСС ${processed}/${tail.length}] bad=${bad} fail=${fail} | ${(sec / processed).toFixed(1)}с/стр | ETA ${eta} мин`,
    );
  }
}
const total = Math.round((Date.now() - t0) / 1000);
console.log(
  `СУДЬЯ: bad ${bad} из ${tail.length}${fail ? `, не разобрано ${fail}` : ""} | время: ${Math.floor(total / 60)}м ${total % 60}с | финиш ${new Date().toISOString()}`,
);
