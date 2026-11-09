/**
 * Разовый ремонт5 строк демо-объёма, где модель исчерпала попытки
 * (гейт названия/склейки/пустой ответ): ручные переводы по правилам скилла
 * (название игры — EN; локация — принятая в po форма). 2026-11-08.
 * Запуск: node tmp/fix_demo5.mts
 */
import { readFileSync } from "node:fs";

import { parsePo, renderPo, writePoAtomic } from "../.opencode/skills/renpy-po/po_core.mts";

const fixes: Array<[string, number, string]> = [
  ["it", 69, "Castello Reinmeer"],
  ["ko", 0, "The Survival of Sarah Rose는 서사 판타지 게임입니다. TSSR의 제작은 아직 진행 중입니다."],
  ["zh", 0, "The Survival of Sarah Rose 是一部史诗奇幻游戏。TSSR 的制作仍在进行中。"],
  ["zh", 73, "但没有什么是永恒的，关于新危险的传闻已经开始流传。"],
  ["zh", 80, "在诸多危险之中，玫瑰家族的长女莎拉·罗斯必须走自己的道路。"],
];

for (const [lang, i, val] of fixes) {
  const PO = `patches/ai-voice-pack/po/${lang}.po`;
  const text = readFileSync(PO, "utf-8").replace(/\r\n/g, "\n");
  const entries = parsePo(text).filter((e) => e.msgid);
  const header = text.split("\n\n")[0].split("\n");
  const e = entries[i];
  if (!e) {
    console.log(`[${lang} ${i}] НЕТ СТРОКИ`);
    continue;
  }
  console.log(`[${lang} ${i}] было: ${JSON.stringify(e.msgstr.slice(0, 60))}`);
  e.msgstr = val;
  writePoAtomic(PO, renderPo(entries, header));
}
console.log("готово:", fixes.length);
