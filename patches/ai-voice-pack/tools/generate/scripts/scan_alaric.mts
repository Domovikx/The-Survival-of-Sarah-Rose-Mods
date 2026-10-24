#!/usr/bin/env node

/**
 * Сканер неоднозначных символов для Alaric.mts — ТОЛЬКО ДИАГНОСТИКА.
 */

import { readFileSync } from "node:fs";

const content = readFileSync("patches/ai-voice-pack/casts/voices/Alaric/Alaric.mts", "utf8");
const lines = content.split(/\r?\n/);

const isLatin = (ch: string): boolean => /[A-Za-z]/.test(ch);
const isCyrillic = (ch: string): boolean => /[\u0400-\u04FF]/.test(ch);

const findings: Array<{ line: number; text: string; detail: string }> = [];

lines.forEach((raw, idx) => {
  const lineNo = idx + 1;

  // Проверяем смешанные скрипты
  const mask = raw.replace(/\\(?:u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (m) => "\u0000".repeat(m.length));
  const words = mask.match(/[\p{L}]+(?:['\u2019][\p{L}]+)*/gu) ?? [];

  for (const w of words) {
    let lat = 0,
      cyr = 0;
    for (const ch of w) {
      if (isLatin(ch)) lat++;
      else if (isCyrillic(ch)) cyr++;
    }

    if (lat > 0 && cyr > 0) {
      const chars = [...w].filter((c) => isCyrillic(c)).map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase()}`);
      findings.push({ line: lineNo, text: w, detail: `"${w}" — смешанный скрипт (${chars.join(", ")})` });
    }
  }
});

console.log(`--- Сканер для patches/ai-voice-pack/casts/voices/Alaric/Alaric.mts ---`);
if (findings.length === 0) {
  console.log("Чисто — неоднозначных символов не найдено.");
} else {
  for (const f of findings) {
    console.log(`${f.line}: [MIXED_SCRIPT] ${f.detail}`);
  }
}
