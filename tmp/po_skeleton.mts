/**
 * tmp/po_skeleton.mts — создаёт скелеты po/<lang>.po под все языки перевода
 * (список языков: NeonTranslator TCCN — de, es, fr, it, ja, ko, pl, pt, ru, zh).
 *
 * Скелет = шапка с языковыми Plural-Forms + все записи template.pot с пустым
 * msgstr. Существующие файлы (ru.po, es.po) НЕ трогаются — только новые.
 * Порядок записей — как в renderPo (msgid, msgctxt), как у po:update.
 *
 * ЗАПУСК (из корня репы): node tmp/po_skeleton.mts [--force]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parsePo, renderPo } from "../.opencode/skills/renpy-po/po_core.mts";

const PO_DIR = "patches/ai-voice-pack/po";
const POT = join(PO_DIR, "template.pot");
const force = process.argv.includes("--force");
const argvIncludes = (f: string): boolean => process.argv.includes(f);

/** Языки перевода TSSR (список владельца 2026-10-23 = NeonTranslator TCCN). */
const LANGS: Record<string, { name: string; plurals: string }> = {
  de: { name: "Deutsch", plurals: "nplurals=2; plural=(n != 1);" },
  es: { name: "Español", plurals: "nplurals=2; plural=(n != 1);" },
  fr: { name: "Français", plurals: "nplurals=2; plural=(n > 1);" },
  it: { name: "Italiano", plurals: "nplurals=2; plural=(n != 1);" },
  ja: { name: "日本語", plurals: "nplurals=1; plural=0;" },
  ko: { name: "한국어", plurals: "nplurals=1; plural=0;" },
  pl: {
    name: "Polski",
    plurals:
      "nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);",
  },
  pt: { name: "Português", plurals: "nplurals=2; plural=(n != 1);" },
  ru: { name: "Русский", plurals: "nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);" },
  zh: { name: "中文", plurals: "nplurals=1; plural=0;" },
};

function main(): void {
  const potText = readFileSync(POT, "utf-8");
  const potEntries = parsePo(potText).filter((e) => e.msgid);
  console.log(`template.pot: ${potEntries.length} записей`);

  for (const [lang, meta] of Object.entries(LANGS)) {
    const path = join(PO_DIR, `${lang}.po`);
    if (existsSync(path) && !force) {
      console.log(`SKIP ${path} — уже существует (для пересоздания --force)`);
      continue;
    }
    // СТОРАЖ: --force не смеет уничтожить файл с переводами (инцидент
    // 2026-10-23: --force перезаписал es.po/ru.po — переводы восстановлены
    // из git). Пересоздать можно только пустой скелет; непустой — под
    // явным --destroy.
    if (existsSync(path) && !argvIncludes("--destroy")) {
      const existing = readFileSync(path, "utf-8");
      const filled = existing
        .split("\n")
        .filter((l) => l.startsWith('msgstr "') && l !== 'msgstr ""').length;
      if (filled > 0) {
        console.log(`ОТКАЗ ${path}: в файле ${filled} переводов — --force недостаточно, нужен --destroy (и то после бэкапа)`);
        continue;
      }
    }
    const header = [
      `# TSSR ${lang.toUpperCase()} translation — скелет из po/template.pot (${meta.name}).`,
      "# msgstr \"\" = не переведено; заполняется построчно переводчиком.",
      "msgid \"\"",
      "msgstr \"\"",
      `"Project-Id-Version: TSSR-Mods 1.0\\n"`,
      `"PO-Revision-Date: 2026-10-23 00:00+0000\\n"`,
      `"Language: ${lang}\\n"`,
      `"MIME-Version: 1.0\\n"`,
      `"Content-Type: text/plain; charset=UTF-8\\n"`,
      `"Content-Transfer-Encoding: 8bit\\n"`,
      `"Plural-Forms: ${meta.plurals}\\n"`,
    ];
    // Скелет: записи POT с пустым msgstr, БЕЗ комментариев (DRY: тон/arc/
    // scene/uid живут только в template.pot — pot_resolve.mts).
    const entries = potEntries.map((e) => ({ ...e, msgstr: "", comments: [], refs: [] }));
    writeFileSync(path, renderPo(entries, header), "utf-8");
    console.log(`СОЗДАН ${path} — ${entries.length} пустых записей`);
  }
}

main();
