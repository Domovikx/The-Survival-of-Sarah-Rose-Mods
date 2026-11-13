/**
 * po_phrases_probe.mts — замер покрытия 7 витринных фраз сайта в po/<lang>.po.
 * Честный парсер po (многострочные литералы, unescape); ищет msgid -> msgstr.
 * Запуск: node tmp/po_phrases_probe.mts
 */
import { readFileSync } from "node:fs";

const en = JSON.parse(readFileSync("site/locales/en.json", "utf8"));
const ru = JSON.parse(readFileSync("site/locales/ru.json", "utf8"));

function parsePo(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const blocks = text.split(/\n\n+/);
  for (const b of blocks) {
    const get = (kw: string): string | null => {
      const re = new RegExp(`^${kw} ("(?:[^"\\\\]|\\\\.)*"(?:\\n"(?:[^"\\\\]|\\\\.)*")*)`, "m");
      const m = re.exec(b);
      if (!m) return null;
      return m[1]!
        .split("\n")
        .map((l) => l.slice(1, -1))
        .join("")
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    };
    const id = get("msgid");
    const str = get("msgstr");
    if (id !== null && str !== null && !map.has(id)) map.set(id, str);
  }
  return map;
}

const LANGS = ["de", "es", "fr", "it", "ja", "ko", "pl", "pt", "zh", "ru"];
for (const lang of LANGS) {
  const po = parsePo(readFileSync(`patches/ai-voice-pack/po/${lang}.po`, "utf8"));
  let hit = 0;
  const miss: number[] = [];
  en.demo.phrases.forEach((p: { text: string }, i: number) => {
    const tr = po.get(p.text);
    if (tr && tr.trim()) hit++;
    else miss.push(i + 1);
  });
  console.log(`${lang}: ${hit}/7 переведено в po${miss.length ? ", дыры: #" + miss.join(",") : ""}`);
}
console.log("\n--- ru-эталон стиля (site/locales/ru.json) ---");
ru.demo.phrases.forEach((p: { speaker: string; text: string }, i: number) =>
  console.log(`${i + 1}. [${p.speaker}] ${p.text}`),
);
