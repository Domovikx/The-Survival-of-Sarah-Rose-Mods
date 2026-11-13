/**
 * site_l10n_caps.mts — каптионы cap2/cap4 под новые кадры галереи (2026-11-11:
 * владелец: «нет китайского и немецкого на скринах»): cap2 -> кадр китайского
 * (CJK без квадратов), cap4 -> кадр немецкого. Патчит словари T генератора.
 * Запуск: node tmp/site_l10n_caps.mts && node tmp/site_l10n_gen.mts
 */
import { readFileSync, writeFileSync } from "node:fs";

const GEN = "tmp/site_l10n_gen.mts";
const CAPS: Record<string, { cap2: string; cap4: string }> = {
  de: {
    cap2: "Chinesisch: CJK-Text ohne Kästchen",
    cap4: "Deutsche Lokalisierung",
  },
  es: {
    cap2: "Chino: texto CJK sin cuadros",
    cap4: "Localización en alemán",
  },
  fr: {
    cap2: "Chinois : texte CJK sans carrés",
    cap4: "Localisation allemande",
  },
  it: {
    cap2: "Cinese: testo CJK senza quadratini",
    cap4: "Localizzazione tedesca",
  },
  ja: {
    cap2: "中国語：文字化けなしのCJKテキスト",
    cap4: "ドイツ語版",
  },
  ko: {
    cap2: "중국어: 깨진 글자 없는 CJK 텍스트",
    cap4: "독일어 번역",
  },
  pl: {
    cap2: "Chiński: tekst CJK bez kwadracików",
    cap4: "Lokalizacja niemiecka",
  },
  pt: {
    cap2: "Chinês: texto CJK sem quadradinhos",
    cap4: "Localização alemã",
  },
  zh: {
    cap2: "中文对话（CJK 字形无乱码）",
    cap4: "德语本地化",
  },
};

let src = readFileSync(GEN, "utf8");
let total = 0;
for (const [lang, caps] of Object.entries(CAPS)) {
  const start = src.indexOf(`  ${lang}: {`);
  const end = src.indexOf("\n  },", start);
  if (start < 0 || end < 0) throw new Error(`блок ${lang} не найден`);
  let block = src.slice(start, end);
  for (const [key, value] of Object.entries(caps)) {
    const re = new RegExp(`(\\b${key}:\\s*)("((?:[^"\\\\]|\\\\.)*)")`);
    if (!re.test(block)) throw new Error(`${lang}.${key}: не найдено`);
    block = block.replace(re, `$1"${value.replace(/"/g, '\\"')}"`);
    total++;
  }
  src = src.slice(0, start) + block + src.slice(end);
}
writeFileSync(GEN, src);
console.log(`каптионов обновлено: ${total}`);
