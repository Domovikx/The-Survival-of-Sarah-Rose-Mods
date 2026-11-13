/**
 * phrases_to_po.mts — вносит переводы 7 витринных фраз сайта в po/<lang>.po
 * (пустые msgstr под msgid = EN-текст из манифеста). Тексты берутся из
 * site/locales/{lang}.json (согласованный слой перевода). Атомарная запись.
 * Запуск: node tmp/phrases_to_po.mts
 */
import { readFileSync, writeFileSync, renameSync } from "node:fs";

const LANGS = ["de", "es", "fr", "it", "ja", "ko", "pl", "pt", "zh"];
const poEscape = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

const manifest = JSON.parse(readFileSync("site/src/widgets/demo/manifest.json", "utf8"));
const phrases: Array<{ uid: string; text: string }> = manifest.phrases;

for (const lang of LANGS) {
  const loc = JSON.parse(readFileSync(`site/locales/${lang}.json`, "utf8"));
  const path = `patches/ai-voice-pack/po/${lang}.po`;
  let po = readFileSync(path, "utf8");
  let done = 0;
  phrases.forEach((p, i) => {
    const tr: string = loc.demo.phrases[i].text;
    // ЛИТЕРАЛЬНАЯ замена (не regex: ? и прочие метасимволы в тексте
    // ломали поиск — 2026-11-11 грабли с фразами Carolyn/Garret).
    const from = `msgid "${poEscape(p.text)}"\nmsgstr ""`;
    const to = `msgid "${poEscape(p.text)}"\nmsgstr "${poEscape(tr)}"`;
    if (po.includes(from)) {
      po = po.replace(from, to);
      done++;
    }
  });
  const tmp = path + ".part";
  writeFileSync(tmp, po);
  renameSync(tmp, path);
  console.log(`${lang}: внесено ${done}/7`);
}
console.log("готово; проверка: npm run po:check");
