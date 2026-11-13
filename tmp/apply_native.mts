import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePo, renderPo, writePoAtomic } from "../.opencode/skills/renpy-po/po_core.mts";

/** Вычитанные вручную переопределения (модель дала вариант с ошибкой в первом прогоне). */
const OVERRIDE: Record<string, Record<number, string>> = {
  it: { 30296: "Una volta feci un pompino a un vecchio marinaio." },
  pt: { 30296: "Uma vez, eu chupei o pau de um velho marinheiro." },
  zh: {
    1023:
      "莎拉仍然感到自己的每一寸存在都被掌控着——头发依旧被紧紧扯住，小穴暴露在外，正遭受着侵入。她能做的唯一一件事，就是死死抓住墙壁。",
  },
};

for (const lang of ["de", "es", "fr", "it", "pl", "pt", "ko", "zh", "ja"]) {
  const json = `tmp/native_${lang}.json`;
  const poPath = join("patches", "ai-voice-pack", "po", `${lang}.po`);
  const text = readFileSync(poPath, "utf-8").replace(/\r\n/gu, "\n");
  const entries = parsePo(text).filter((e) => e.msgid);
  const header = text.split("\n\n")[0]!.split("\n");
  if (!existsSync(json)) {
    console.log(`${lang}: нет отчёта, пропуск`);
    continue;
  }
  const rows = JSON.parse(readFileSync(json, "utf-8")).rows as Array<{
    idx: number;
    neu: string;
    gates: string[];
  }>;
  let n = 0;
  for (const r of rows) {
    if (r.gates.length) continue;
    const neu = OVERRIDE[lang]?.[r.idx] ?? r.neu;
    if (!neu || neu === entries[r.idx]!.msgstr) continue;
    entries[r.idx]!.msgstr = neu;
    n++;
  }
  if (n) writePoAtomic(poPath, renderPo(entries, header));
  console.log(`${lang}: правок ${n}`);
}
