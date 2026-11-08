/**
 * Аудит канона имён: ищет в msgstr варианты написаний, отличные от канона
 * speaker-name (но не склонения). Read-only, отчёт по убыванию частоты.
 * Запуск: node tmp/audit_names.mts
 */
import { readFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

const PO = "patches/ai-voice-pack/po/ru.po";
const entries = parsePo(readFileSync(PO, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);

const NAME_CANON = new Map<string, string>();
for (const e of entries) {
  if (e.msgctxt === "speaker-name" && e.msgid && e.msgstr.trim() && !NAME_CANON.has(e.msgid)) {
    NAME_CANON.set(e.msgid, e.msgstr.trim());
  }
}

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
// Общая префиксная часть.
const commonPrefix = (a: string, b: string): number => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

// Вариант ≠ канон, но не склонение (склонение меняет только суффикс).
const variants = new Map<string, Map<string, number>>();
for (const e of entries) {
  if (!e.msgstr || e.msgctxt === "speaker-name") continue;
  for (const [enName, canon] of NAME_CANON) {
    if (!e.msgid.includes(enName)) continue;
    for (const cw of canon.split(" ")) {
      if (cw.length < 4) continue;
      for (const w of e.msgstr.match(/[А-ЯЁ][а-яё]+/g) ?? []) {
        if (w === cw || w.startsWith(cw) || cw.startsWith(w)) continue; // канон/склонения
        const d = editDist(w, cw);
        if (d > 2) continue;
        // Суффиксное изменение (склонение) vs подмена в середине: общий префикс.
        if (commonPrefix(w, cw) >= Math.min(w.length, cw.length) - 1) continue;
        const key = `${cw} ≠ ${w}`;
        const m = variants.get(key) ?? new Map<string, number>();
        m.set(e.msgid.slice(0, 50), (m.get(e.msgid.slice(0, 50)) ?? 0) + 1);
        variants.set(key, m);
      }
    }
  }
}

const rows = [...variants.entries()].map(([k, m]) => [k, [...m.values()].reduce((a, b) => a + b, 0)] as const);
rows.sort((a, b) => b[1] - a[1]);
for (const [k, n] of rows) console.log(`${String(n).padStart(5)}  ${k}`);
console.error(`вариантов: ${rows.length}`);
