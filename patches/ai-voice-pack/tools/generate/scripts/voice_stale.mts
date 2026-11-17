/**
 * voice_stale.mts — аудит корпуса озвучки против текущего `po`.
 *
 * Классы:
 *   OK              имя совпадает с ожидаемым состоянием (перевод + тон)
 *   STALE           текст/тон изменились → звук устарел, надо переозвучить
 *   NO-TRANSLATION  перевод в po сейчас пуст (озвучивать нечего)
 *   ORPHAN          строки больше нет в POT (en16 не найден)
 *   LEGACY          имя старой схемы `{uid32}__{variant}` — состояние неизвестно
 *   UNKNOWN-VOICE   вариант не встречается в кастах (проверка отдельная, здесь справочно)
 *
 * Запуск:
 *   node tools/generate/scripts/voice_stale.mts                 # отчёт
 *   node tools/generate/scripts/voice_stale.mts --lang zh
 *   node tools/generate/scripts/voice_stale.mts --delete        # удалить STALE+NO-TRANSLATION
 *   node tools/generate/scripts/voice_stale.mts --delete-legacy # + легаси-имена
 *
 * Отчёт: tmp/voice_stale.json
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parsePo } from "../../../../../.opencode/skills/renpy-po/po_core.mts";
import { parseVoiceName, stateHash } from "./voice_names.mts";

// Пути переопределяемы: тест гоняет тот же код на синтетическом корпусе (E2E
// обнаружения устаревших), не трогая настоящий.
const AUDIO = process.env.TSSR_AUDIO_DIR ?? join("patches", "ai-voice-pack", "audio");
const POT_PATH = process.env.TSSR_POT ?? join("patches", "ai-voice-pack", "po", "template.pot");
const PO_DIR = process.env.TSSR_PO_DIR ?? join("patches", "ai-voice-pack", "po");
const REPORT = process.env.TSSR_STALE_JSON ?? join("tmp", "voice_stale.json");
const args = process.argv.slice(2);
const DELETE = args.includes("--delete");
const DELETE_LEGACY = args.includes("--delete-legacy");
const langAt = args.indexOf("--lang");
const ONLY_LANG = langAt >= 0 ? args[langAt + 1] : undefined;

const md5 = (s: string): string => createHash("md5").update(s, "utf8").digest("hex");
const meta = (c: string[], p: string): string => (c.find((x) => x.startsWith(p)) ?? "").slice(p.length).trim();

type Cls = "OK" | "STALE" | "NO-TRANSLATION" | "ORPHAN" | "LEGACY";
type Row = { lang: string; file: string; cls: Cls; en?: string; variant?: string };

const pot = parsePo(readFileSync(POT_PATH, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);
const byEn16 = new Map<string, { en: string; emotion: string; key: string }>();
for (const e of pot)
  byEn16.set(md5(e.msgid).slice(0, 16), {
    en: e.msgid,
    emotion: meta(e.comments, "emotion_new:") || meta(e.comments, "emotion:"),
    key: `${e.msgctxt}\u0000${e.msgid}`,
  });

const poCache = new Map<string, Map<string, string>>();
const poOf = (lang: string): Map<string, string> => {
  const cached = poCache.get(lang);
  if (cached) return cached;
  const file = join(PO_DIR, `${lang}.po`);
  const map = new Map<string, string>();
  if (existsSync(file))
    for (const e of parsePo(readFileSync(file, "utf-8").replace(/\r\n/g, "\n")))
      if (e.msgid) map.set(`${e.msgctxt}\u0000${e.msgid}`, e.msgstr);
  poCache.set(lang, map);
  return map;
};

const rows: Row[] = [];
const counts: Record<string, Record<Cls, number>> = {};
let deleted = 0;

for (const lang of readdirSync(AUDIO)) {
  const langDir = join(AUDIO, lang);
  if (!statSync(langDir).isDirectory()) continue;
  if (ONLY_LANG && lang !== ONLY_LANG) continue;
  counts[lang] = { "OK": 0, "STALE": 0, "NO-TRANSLATION": 0, "ORPHAN": 0, "LEGACY": 0 };
  const po = poOf(lang);

  for (const arc of readdirSync(langDir)) {
    const arcDir = join(langDir, arc);
    if (!statSync(arcDir).isDirectory()) continue;
    for (const file of readdirSync(arcDir)) {
      const modern = parseVoiceName(file);
      const legacy = /^([0-9a-f]{32})__(.+)\.(?:opus|wav)$/.exec(file);
      if (!modern && !legacy) continue;
      const rel = `${lang}/${arc}/${file}`;
      const uid16 = modern ? modern.en16 : legacy![1]!.slice(0, 16);
      const variant = modern ? modern.variant : legacy![2]!;
      const src = byEn16.get(uid16);

      let cls: Cls;
      if (!src) cls = "ORPHAN";
      else {
        const text = lang === "en" ? src.en : (po.get(src.key) ?? "");
        if (!text.trim()) cls = "NO-TRANSLATION";
        else if (!modern) cls = "LEGACY";
        else cls = modern.state8 === stateHash(text, src.emotion) ? "OK" : "STALE";
      }
      counts[lang]![cls]++;
      rows.push({ lang, file: rel, cls, en: src?.en, variant });

      if (DELETE && (cls === "STALE" || cls === "NO-TRANSLATION")) {
        rmSync(join(arcDir, file));
        deleted++;
      } else if (DELETE_LEGACY && cls === "LEGACY") {
        rmSync(join(arcDir, file));
        deleted++;
      }
    }
  }
}

writeFileSync(REPORT, `${JSON.stringify(rows, null, 1)}\n`, "utf-8");

console.log(`=== АУДИТ ОЗВУЧКИ${DELETE || DELETE_LEGACY ? ` (удалено ${deleted})` : ""} ===`);
for (const [lang, c] of Object.entries(counts)) {
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  const bad = c.STALE + c["NO-TRANSLATION"] + c.ORPHAN + c.LEGACY;
  console.log(
    `  ${lang.padEnd(3)} ${String(total).padStart(5)} файлов | ок ${String(c.OK).padStart(5)} | устарело ${String(c.STALE).padStart(3)} | без перевода ${String(c["NO-TRANSLATION"]).padStart(3)} | нет в POT ${String(c.ORPHAN).padStart(2)} | легаси ${String(c.LEGACY).padStart(3)}${bad ? "" : "  ✓"}`,
  );
}

const examples = rows.filter((r) => r.cls === "STALE").slice(0, 5);
if (examples.length) {
  console.log("\nпримеры устаревших:");
  for (const r of examples) console.log(`  ${r.file}\n    EN: ${(r.en ?? "").slice(0, 80)}`);
}
console.log(`\nотчёт: ${REPORT}`);
if (!DELETE && !DELETE_LEGACY) console.log("удалить устаревшие: --delete (легаси отдельно: --delete-legacy)");
