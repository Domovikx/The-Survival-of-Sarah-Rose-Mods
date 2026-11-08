/**
 * Аудит утечек в po: (а) tr почти дословно равен переводу соседней строки
 * (EN-оригиналы при этом разные) или (б) tr содержит перевод соседа целиком.
 * Печатает строки в формате repair_list.txt ([изменено N] ...).
 * Сравнение длины msgstr/msgid НЕ используется (запрет владельца) — только
 * структурное сходство с чужой строкой.
 */
import { readFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

const PO = "patches/ai-voice-pack/po/ru.po";

const editDist = (a: string, b: string): number => {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return dp[b.length];
};
const sim = (a: string, b: string): number => 1 - editDist(a, b) / Math.max(a.length, b.length, 1);

const entries = parsePo(readFileSync(PO, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);
let found = 0;
entries.forEach((e, i) => {
  if (!e.msgstr || e.msgctxt === "speaker-name") return;
  for (const n of [entries[i - 1], entries[i + 1]]) {
    if (!n || !n.msgstr || !n.msgid || n.msgid === e.msgid) continue;
    if (n.msgctxt === "speaker-name") continue;
    const dup = e.msgstr.length >= 20 && n.msgstr.length >= 20 && sim(e.msgstr, n.msgstr) > 0.75 && sim(e.msgid, n.msgid) < 0.6;
    const glue = n.msgstr.length >= 20 && e.msgstr.includes(n.msgstr);
    if (dup || glue) {
      found++;
      console.log(`[изменено ${i}] ${e.msgid.slice(0, 70)}`);
      break;
    }
  }
});
console.error(`утечек найдено: ${found}`);
