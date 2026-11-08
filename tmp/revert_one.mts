/** Точечный откат одной правки + снятие её статуса (пересуд новым стандартом). */
import { readFileSync, writeFileSync } from "node:fs";

import { parsePo, renderPo, writePoAtomic } from "../.opencode/skills/renpy-po/po_core.mts";

const [msgid, oldText, jsonlPath = "tmp/po_repair_full_ru.jsonl"] = process.argv.slice(2);
const poPath = "patches/ai-voice-pack/po/ru.po";

const text = readFileSync(poPath, "utf-8").replace(/\r\n/g, "\n");
const entries = parsePo(text);
const hits = entries.filter((e) => e.msgid === msgid);
if (hits.length !== 1) {
  console.error(`ожидалась ровно одна запись, найдено: ${hits.length}`);
  process.exit(2);
}
console.log(`БЫЛО в файле: ${hits[0].msgstr}`);
hits[0].msgstr = oldText;
writePoAtomic(poPath, renderPo(entries, text.split("\n\n")[0].split("\n")));
console.log(`СТАЛО:        ${oldText}`);

// Снимаем статус: строка должна уйти в повторный суд новым стандартом.
const lines = readFileSync(jsonlPath, "utf-8").split("\n").filter(Boolean);
const kept = lines.filter((l) => {
  try {
    return (JSON.parse(l) as { msgid?: string }).msgid !== msgid;
  } catch {
    return true;
  }
});
writeFileSync(jsonlPath, kept.length ? `${kept.join("\n")}\n` : "", "utf-8");
console.log(`журнал: ${lines.length} -> ${kept.length} строк`);
