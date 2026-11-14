#!/usr/bin/env node
/**
 * ПРАВКА ИМЁН/ПОДПИСЕЙ СПИКЕРОВ в po по списку решений.
 *
 * Зачем: `speaker-name` — это то, что игрок видит как имя говорящего. Модель
 * переводила их как обычные слова и выдавала «Took → Nahm» (немецкий глагол
 * «взял»), в fr-файл попадали испанские слова, часть строк осталась по-английски.
 * Эти строки — канон для промпта перевода (nameGlossary строит глоссарий из
 * msgstr speaker-name), поэтому лечим их точечно и атомарно.
 *
 * Формат списка (JSON): [{ "lang": "de", "msgid": "Took", "msgstr": "Tuk" }]
 * Опционально "msgctxt" (по умолчанию "speaker-name").
 *
 * Правка — только строка msgstr внутри нужного блока: остальной файл не
 * пересобирается (git diff остаётся читаемым), запись атомарная (writePoAtomic).
 *
 *   node .opencode/skills/translate/translate_names_fix.mts tmp/names_fix.json [--dry]
 */
import { readFileSync } from "node:fs";

import { poEscape, writePoAtomic } from "../renpy-po/po_core.mts";

type Fix = { lang: string; msgid: string; msgstr: string; msgctxt?: string };

const listPath = process.argv[2];
if (!listPath) {
  console.error("использование: translate_names_fix.mts <fix.json> [--dry]");
  process.exit(2);
}
const DRY = process.argv.includes("--dry");
const fixes = JSON.parse(readFileSync(listPath, "utf-8")) as Fix[];

const byLang = new Map<string, Fix[]>();
for (const f of fixes) {
  const arr = byLang.get(f.lang) ?? [];
  arr.push(f);
  byLang.set(f.lang, arr);
}

let applied = 0;
let missed: string[] = [];

for (const [lang, list] of byLang) {
  const path = `patches/ai-voice-pack/po/${lang}.po`;
  const text = readFileSync(path, "utf-8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(eol);
  const pending = new Map(list.map((f) => [`${f.msgctxt ?? "speaker-name"}\u0000${f.msgid}`, f]));

  let ctxt: string | null = null;
  let id: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const c = /^msgctxt "(.*)"$/.exec(line);
    if (c) {
      ctxt = c[1];
      continue;
    }
    const m = /^msgid "(.*)"$/.exec(line);
    if (m) {
      id = m[1];
      continue;
    }
    const s = /^msgstr "(.*)"$/.exec(line);
    if (!s || id === null || ctxt === null) continue;
    const k = `${ctxt}\u0000${id}`;
    const fix = pending.get(k);
    if (fix) {
      const before = s[1];
      const after = poEscape(fix.msgstr);
      if (before === after) {
        console.log(`  ${lang} ${fix.msgid}: уже так («${after}»)`);
      } else {
        lines[i] = `msgstr "${after}"`;
        console.log(`  ${lang} ${fix.msgid}: «${before}» -> «${after}»`);
        applied++;
      }
      pending.delete(k);
    }
  }

  for (const left of pending.values()) missed.push(`${lang}:${left.msgid}`);
  if (!DRY) writePoAtomic(path, lines.join(eol));
}

if (missed.length) console.log(`\nНЕ НАЙДЕНО (${missed.length}): ${missed.join(", ")}`);
console.log(`\n${DRY ? "[dry] " : ""}исправлено: ${applied} из ${fixes.length}`);
process.exit(missed.length ? 1 : 0);
