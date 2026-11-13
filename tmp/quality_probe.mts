import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

const LAT = { de: /[a-zäöüß]/iu, es: /[a-záéíóúñ]/iu, fr: /[a-zàâçéèêëîïôûùüÿ]/iu, it: /[a-zàèéìíîòóùú]/iu, pl: /[a-ząćęłńóśźż]/iu, pt: /[a-záâãàçéêíóôõú]/iu } as const;

// it: все «laughs» и их перевод — системный ли это баг
const it = parsePo(readFileSync("patches/ai-voice-pack/po/it.po", "utf-8").replace(/\r\n/gu, "\n")).filter((e) => e.msgid);
console.log("=== it, EN со словом laugh:");
for (const [i, e] of it.entries()) {
  if (!e.msgstr || !/\blaugh/i.test(e.msgid)) continue;
  console.log(` [${i}] EN=${e.msgid.slice(0, 70)} | IT=${e.msgstr.slice(0, 70)}`);
}

// Сколько строк вообще не переведено (msgstr === msgid) / осталось англ. текстом
console.log("\n=== незакрытые строки (msgstr = msgid) и латиница в нелатинских:");
for (const lang of ["de", "es", "fr", "it", "pl", "pt", "ko", "zh", "ja"]) {
  const es = parsePo(readFileSync(`patches/ai-voice-pack/po/${lang}.po`, "utf-8").replace(/\r\n/gu, "\n")).filter((e) => e.msgid);
  const tr = es.filter((e) => e.msgstr.trim());
  const same = tr.filter((e) => e.msgstr.trim() === e.msgid.trim());
  let latin = 0;
  if (!(lang in LAT)) {
    for (const e of tr) {
      // для CJK/ко: перевод, где ≥3 слов подряд латиницей = не переведено
      if (/[A-Za-z]{3,}(\s+[A-Za-z]{3,}){2,}/u.test(e.msgstr)) latin++;
    }
  }
  console.log(` ${lang}: переведено ${tr.length} | msgstr=msgid ${same.length}${["ko","zh","ja"].includes(lang) ? ` | англ. фраза ${latin}` : ""}`);
}
