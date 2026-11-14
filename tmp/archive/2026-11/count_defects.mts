import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { banTerms, isDefective, findTerms } from "../.opencode/skills/translate/tone_lexicon.mts";
const entries = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((e) => e.msgid);
const bad = entries.filter((e) => e.msgstr && isDefective(e.msgstr, e.msgid, "ru"));
const weakOnly: string[] = [];
for (const e of entries) {
  if (!e.msgstr || isDefective(e.msgstr, e.msgid, "ru")) continue;
  const t = findTerms(e.msgstr, "ru");
  if (t.weak.length) weakOnly.push(`${t.weak.join(",")}`);
}
console.log("дефектных строк:", bad.length, "| из них с влагалищем:", bad.filter((e) => /влагалищ/iu.test(e.msgstr)).length);
console.log("строк, где осталось только слабое слово (теперь не трогаем):", weakOnly.length);
console.log("встречаемость слабых:", JSON.stringify(weakOnly.reduce((a, w) => ((a[w] = (a[w] ?? 0) + 1), a), {} as Record<string, number>)));
console.log("запрет модели (ru):", banTerms("ru").join(", "));
