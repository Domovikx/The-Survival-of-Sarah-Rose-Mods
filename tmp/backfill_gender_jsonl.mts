/**
 * backfill_gender_jsonl.mts — разовое обогащение po/<lang>.jsonl полем gender.
 *
 * Существующие записи jsonl (до 2026-11-02) писались без пола спикера —
 * ревью-журнал рядом с po не показывал род. Теги `#. speaker_gender:` уже в
 * POT → здесь для каждой записи jsonl резолвим пол по msgid (однозначное
 * совпадение в POT; неоднозначное — пропускаем, пол не выдумываем).
 * Новые записи пишутся с gender автоматически (po_translate).
 *
 * Запись атомарная (.part → rename) — тот же контракт, что у po.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parsePo, writePoAtomic } from "../.opencode/skills/renpy-po/po_core.mts";

const PO_DIR = join(process.cwd(), "patches", "ai-voice-pack", "po");

/** msgid -> множество полов из POT (комментарий speaker_gender). */
function potGenders(): Map<string, Set<string>> {
  const potText = readFileSync(join(PO_DIR, "template.pot"), "utf-8").replace(/\r\n/g, "\n");
  const m = new Map<string, Set<string>>();
  for (const e of parsePo(potText)) {
    if (!e.msgid) continue;
    const g = e.comments.find((c) => c.startsWith("speaker_gender:"));
    if (!g) continue;
    const set = m.get(e.msgid) ?? new Set<string>();
    set.add(g.slice("speaker_gender:".length).trim());
    m.set(e.msgid, set);
  }
  return m;
}

const genders = potGenders();
const langs = ["de", "es", "fr", "it", "ja", "ko", "pl", "pt", "ru", "zh"];
let totalFilled = 0;
let totalAmbiguous = 0;

for (const lang of langs) {
  const path = join(PO_DIR, `${lang}.jsonl`);
  if (!existsSync(path)) continue;
  const lines = readFileSync(path, "utf-8").split("\n");
  let filled = 0;
  let ambiguous = 0;
  const out: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as Record<string, unknown>;
      if (rec.gender === undefined && typeof rec.msgid === "string") {
        const set = genders.get(rec.msgid);
        if (set && set.size === 1) {
          rec.gender = [...set][0];
          filled++;
        } else if (set && set.size > 1) {
          ambiguous++; // один msgid у разных спикеров с разным полом — не угадываем
        }
      }
      out.push(JSON.stringify(rec));
    } catch {
      out.push(line); // битую строку не трогаем
    }
  }
  if (filled) writePoAtomic(path, `${out.join("\n")}\n`);
  totalFilled += filled;
  totalAmbiguous += ambiguous;
  console.log(`${lang}.jsonl: gender добавлен ${filled}${ambiguous ? `, неоднозначных пропущено ${ambiguous}` : ""}`);
}
console.log(`ИТОГО: gender добавлен ${totalFilled}, неоднозначных пропущено ${totalAmbiguous}`);
