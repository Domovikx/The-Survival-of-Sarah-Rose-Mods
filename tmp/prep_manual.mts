import { readFileSync, writeFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

/** Ручные правки остатка ctxt-среза (8 -> после CTX11).
 *
 * Почему вручную: судья 9B veto'ит ИДЕНТИЧНОСТЬ, хотя она легальна
 * (займовое слово в целевом языке), а инструкция IDENTITY NOTE её не
 * переубеждает — проверено напрямую (score 0 при наличии заметки).
 * Для таких строк вердикт даёт человек, а не модель.
 */
const FIXES: Array<[string, string, string]> = [
  // Italian: "mouse" и "test" — употребительные заимствования, так и пишутся
  ["it", "Mouse", "Mouse"],
  ["it", "Test", "Test"],
  // Polish: тоже заимствования, UI-кнопка
  ["pl", "Test", "Test"],
  // Polish: "Faded Stars Ink" — название заведения, переводится только глагол
  ["pl", "You're looking for Faded Stars Ink", "Szukasz Faded Stars Ink"],
  // Portuguese: "Não puna" — корректное повелительное от punir (pun- + a),
  // судья ошибочно предлагала "punha"/"punir"
  ["pt", "Do not punish Oliver", "Não puna Oliver"],
  // Japanese: вернуть выпавшие теги {a=...}...{/a}
  [
    "ja",
    "Made with {a=https://www.renpy.org/}Ren'Py{/a} [renpy.version_only].\\n\\n[renpy.license!t]",
    "{a=https://www.renpy.org/}Ren'Py{/a} で作成 [renpy.version_only].\\n\\n[renpy.license!t]",
  ],
];

const out: Array<{ lang: string; idx: number; op: string; text: string }> = [];

for (const [lang, msgid, text] of FIXES) {
  const po = readFileSync(`patches/ai-voice-pack/po/${lang}.po`, "utf-8").replace(/\r\n/g, "\n");
  const ents = parsePo(po).filter((e) => e.msgid);
  const idx = ents.findIndex((e) => e.msgid === msgid && !e.msgstr.trim());
  if (idx < 0) {
    console.error(`НЕ НАЙДЕН (или уже переведён): ${lang} :: ${msgid.slice(0, 50)}`);
    process.exit(1);
  }
  out.push({ lang, idx, op: "set", text });
  console.log(`${lang} idx=${idx} -> ${text.slice(0, 60)}`);
}

writeFileSync("tmp/po_fixes_manual.json", JSON.stringify(out, null, 1));
console.log(`\nподготовлено: ${out.length} (НЕ применено — жду остановки очереди)`);
