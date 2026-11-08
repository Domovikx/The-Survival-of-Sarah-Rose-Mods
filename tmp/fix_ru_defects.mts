/**
 * tmp/fix_ru_defects.mts — точечная правка 3 дефектов ru.po (одноразовая).
 *
 * Найдены прогоном судьи 2026-11-01 (выборка 60, ниже порога 11; после разбора
 * реальных дефекта 3 — строка «turn on him» подтверждена верной по script.rpy,
 * судья ошиблась). Запись ТОЛЬКО через writePoAtomic (правило проекта).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parsePo, renderPo, writePoAtomic } from "../.opencode/skills/renpy-po/po_core.mts";
import { poHeaderLines } from "../.opencode/skills/renpy-po/po_update.mts";

const PO = join(process.cwd(), "patches", "ai-voice-pack", "po", "ru.po");

/** msgid -> новый msgstr (точные совпадения). */
const FIXES: Record<string, string> = {
  // «в тылу» — военная калька; Fuck смягчён до «Чёрт» (домашний стиль — Бля/Блядь).
  "Fuck...on the rear I'm missing out on all the action.":
    "Бля... сзади я упускаю всё самое интересное.",
  // «далёкое от завершения» — калька; «гладить себя» — в ru.po для stroke himself
  // используется «мастурбировать» (домашний стиль); потеряно «in place».
  "The creature, far from done, held her head in place with his free hand, as he continued to stroke himself with the other.":
    "Существо, ещё не закончив, удерживало её голову неподвижно свободной рукой, продолжая мастурбировать себя другой.",
  // Потеряно «pre-orgasmic»; «исходя из лона» — канцелярская калька «out from».
  "She didn't want him to know that by now with each thrust, pre-orgasmic waves rolled through her body, out from between her legs.":
    "Она не хотела, чтобы он знал, что теперь с каждым толчком предоргазмические волны прокатывались по её телу, зарождаясь между её ног.",
};

const text = readFileSync(PO, "utf-8").replace(/\r\n/g, "\n");
const entries = parsePo(text);
let fixed = 0;
for (const e of entries) {
  const next = FIXES[e.msgid];
  if (next !== undefined) {
    if (e.msgstr === next) {
      console.log(`уже исправлено: ${e.msgid.slice(0, 60)}...`);
    } else {
      console.log(`ПРАВКА: ${e.msgid.slice(0, 60)}...`);
      console.log(`  БЫЛО: ${e.msgstr}`);
      console.log(`  СТАЛО: ${next}`);
      e.msgstr = next;
    }
    fixed++;
    delete FIXES[e.msgid];
  }
}
if (Object.keys(FIXES).length) {
  console.error(`НЕ НАЙДЕНО ${Object.keys(FIXES).length} msgid:`);
  for (const k of Object.keys(FIXES)) console.error(`  ${k.slice(0, 80)}`);
  process.exit(2);
}
if (fixed === 0) {
  console.log("нечего править — всё уже исправлено");
  process.exit(0);
}
writePoAtomic(PO, renderPo(entries, poHeaderLines(text)));
console.log(`готово: исправлено ${fixed}, записано атомарно`);
