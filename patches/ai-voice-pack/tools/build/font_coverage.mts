/**
 * font_coverage.mts — независимая проверка «есть ли глиф» у TTF/OTF.
 *
 * Читаем cmap шрифта напрямую (форматы 4 и 12) — без зависимостей и без
 * самого движка. Нужно, чтобы сабсет шрифта нельзя было «случайно» выпустить
 * с дырками: тест сверяет cmap с набором символов из PO (font_charset.mts) и
 * падает ДО сборки, а не в игре у пользователя квадратами.
 */

import { readFileSync } from "node:fs";

/** Диапазоны кодпоинтов, для которых в шрифте есть настоящий глиф. */
export type GlyphRanges = Array<[number, number]>;

function u16(buf: Buffer, off: number): number {
  return buf.readUInt16BE(off);
}

function u32(buf: Buffer, off: number): number {
  return buf.readUInt32BE(off);
}

/** Смещение таблицы cmap из sfnt-заголовка. */
function cmapOffset(buf: Buffer, fontPath: string): number {
  const numTables = u16(buf, 4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (buf.toString("latin1", rec, rec + 4) === "cmap") return u32(buf, rec + 8);
  }
  throw new Error(`cmap не найден: ${fontPath}`);
}

/** format 4 (BMP): сегменты startCode/endCode/idDelta/idRangeOffset. */
function rangesFormat4(buf: Buffer, sub: number): GlyphRanges {
  const segCount = u16(buf, sub + 6) / 2;
  const endOff = sub + 14;
  const startOff = endOff + segCount * 2 + 2; // + reservedPad
  const deltaOff = startOff + segCount * 2;
  const rangeOff = deltaOff + segCount * 2;
  const out: GlyphRanges = [];
  for (let i = 0; i < segCount; i++) {
    const end = u16(buf, endOff + i * 2);
    const start = u16(buf, startOff + i * 2);
    if (start > end || start === 0xffff) continue;
    const ro = u16(buf, rangeOff + i * 2);
    if (ro === 0) {
      out.push([start, end]); // glyph = cp + delta, всегда непустой
      continue;
    }
    // idRangeOffset != 0: глиф может быть 0 (нет символа) — идём по каждому cp.
    for (let cp = start; cp <= end; cp++) {
      const at = rangeOff + i * 2 + ro + (cp - start) * 2;
      if (at + 2 > buf.length) continue;
      if (u16(buf, at) !== 0) out.push([cp, cp]);
    }
  }
  return out;
}

/** format 12 (полный Unicode): группы startChar/endChar/startGlyphID. */
function rangesFormat12(buf: Buffer, sub: number): GlyphRanges {
  const n = u32(buf, sub + 12);
  const out: GlyphRanges = [];
  for (let i = 0; i < n; i++) {
    const g = sub + 16 + i * 12;
    out.push([u32(buf, g), u32(buf, g + 4)]);
  }
  return out;
}

/**
 * Диапазоны глифов шрифта. Предпочитаем format 12 (Unicode целиком), иначе
 * format 4; при нескольких подтаблицах — первая подходящая.
 */
export function glyphRanges(fontPath: string): GlyphRanges {
  const buf = readFileSync(fontPath);
  const cmap = cmapOffset(buf, fontPath);
  const subtables = u16(buf, cmap + 2);
  let fallback: number | null = null;
  for (let i = 0; i < subtables; i++) {
    const rec = cmap + 4 + i * 8;
    const sub = cmap + u32(buf, rec + 4);
    const format = u16(buf, sub);
    if (format === 12) return rangesFormat12(buf, sub);
    if (format === 4 && fallback === null) fallback = sub;
  }
  if (fallback === null) throw new Error(`нет cmap-подтаблицы format 4/12: ${fontPath}`);
  return rangesFormat4(buf, fallback);
}

/** Символы набора, которых в шрифте НЕТ (пустой массив = покрытие полное). */
export function missingGlyphs(fontPath: string, chars: Iterable<string>): string[] {
  const ranges = glyphRanges(fontPath).toSorted((a, b) => a[0] - b[0]);
  const missing: string[] = [];
  for (const ch of chars) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    const hit = ranges.some(([from, to]) => cp >= from && cp <= to);
    if (!hit) missing.push(ch);
  }
  return missing;
}
