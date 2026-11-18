/**
 * voice_stale.mts — аудит корпуса озвучки против текущего `po`.
 *
 * Классы:
 *   OK              имя совпадает с ожидаемым состоянием (перевод + тон)
 *   STALE           текст/тон изменились → звук устарел, надо переозвучить
 *   NO-TRANSLATION  перевод в po сейчас пуст (озвучивать нечего)
 *   ORPHAN          строки больше нет в POT (префикс не найден)
 *   HEX             имя ПРЕДЫДУЩЕЙ схемы `{en16}__{state8}__{variant}` → переименовать
 *                   (`voice_migrate`); рантайм такие имена не находит
 *   LEGACY          имя самой старой схемы `{uid32}__{variant}` — состояние неизвестно
 *   UNKNOWN-VOICE   вариант не встречается в кастах (проверка отдельная, здесь справочно)
 *
 * HEX отделён от LEGACY намеренно: у них разные лекарства (переименовать vs
 * переозвучить). Если смешать их, `--delete-legacy` во время миграции снёс бы
 * весь корпус — класс, способный удалить 13 тыс. живых файлов, обязан
 * называться отдельно.
 *
 * Запуск:
 *   node tools/generate/scripts/voice_stale.mts                 # отчёт
 *   node tools/generate/scripts/voice_stale.mts --lang zh
 *   node tools/generate/scripts/voice_stale.mts --delete        # удалить STALE+NO-TRANSLATION
 *   node tools/generate/scripts/voice_stale.mts --delete-legacy # + легаси-имена
 *
 * Отчёт: tmp/voice_stale.json
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parsePo } from "../../../../../.opencode/skills/renpy-po/po_core.mts";
import { enHash, hexEnHash, md5Hex, parseAnyVoiceName, stateHash } from "./voice_names.mts";

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

const meta = (c: string[], p: string): string => (c.find((x) => x.startsWith(p)) ?? "").slice(p.length).trim();

type Cls = "OK" | "STALE" | "NO-TRANSLATION" | "ORPHAN" | "HEX" | "LEGACY";
type Row = { lang: string; file: string; cls: Cls; en?: string; variant?: string };

/**
 * POT-реплики под ТРЕМЯ ключами сразу: en12 (целевая схема), en16 (hex-переход)
 * и uid32 (легаси). Наборы символов не пересекаются, поэтому одна мапа
 * обслуживает все поколения имён без ветвления на каждом файле.
 *
 * ЗНАЧЕНИЕ — СПИСОК, а не одна запись: один и тот же EN-текст встречается у
 * разных каст с РАЗНЫМ тоном («I do.» — Thomas/Sarah/Marion/Sophia), и каждая
 * реплика имеет своё состояние. Одна запись на текст давала ложные STALE
 * (поймано 2026-11-18 на de: 21 «устаревший» файл был живым).
 */
const pot = parsePo(readFileSync(POT_PATH, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);
type Src = { en: string; emotion: string; key: string };
const byEn = new Map<string, Src[]>();
for (const e of pot) {
  const src: Src = {
    en: e.msgid,
    emotion: meta(e.comments, "emotion_new:") || meta(e.comments, "emotion:"),
    key: `${e.msgctxt}\u0000${e.msgid}`,
  };
  for (const k of [enHash(e.msgid), hexEnHash(e.msgid), md5Hex(e.msgid)]) {
    const arr = byEn.get(k);
    if (arr) arr.push(src);
    else byEn.set(k, [src]);
  }
}

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
  counts[lang] = { "OK": 0, "STALE": 0, "NO-TRANSLATION": 0, "ORPHAN": 0, "HEX": 0, "LEGACY": 0 };
  const po = poOf(lang);

  for (const arc of readdirSync(langDir)) {
    const arcDir = join(langDir, arc);
    if (!statSync(arcDir).isDirectory()) continue;
    for (const file of readdirSync(arcDir)) {
      const parsed = parseAnyVoiceName(file);
      if (!parsed) continue;
      const rel = `${lang}/${arc}/${file}`;
      const { en, variant, scheme } = parsed;
      const srcs = byEn.get(en);

      let cls: Cls;
      if (!srcs || !srcs.length) cls = "ORPHAN";
      else {
        // У одного EN-текста бывает несколько реплик (разные касты/тон).
        const texts = srcs.map((s) => (lang === "en" ? s.en : (po.get(s.key) ?? "")));
        if (texts.every((t) => !t.trim())) cls = "NO-TRANSLATION";
        else if (scheme === "uid32") cls = "LEGACY";
        else if (scheme === "hex") cls = "HEX";
        else {
          // Файл живой, если его состояние совпало с ЛЮБОЙ репликой этого текста.
          const ok = srcs.some((s, i) => texts[i]!.trim() && parsed.state === stateHash(texts[i]!, s.emotion));
          cls = ok ? "OK" : "STALE";
        }
      }
      counts[lang]![cls]++;
      rows.push({ lang, file: rel, cls, en: srcs?.[0]?.en, variant });

      if (DELETE && (cls === "STALE" || cls === "NO-TRANSLATION")) {
        rmSync(join(arcDir, file));
        deleted++;
      } else if (DELETE_LEGACY && cls === "LEGACY") {
        // Только самая старая схема: HEX-имена удалять нельзя — их лекарство
        // переименование (voice_migrate), а не переозвучка.
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
  const bad = c.STALE + c["NO-TRANSLATION"] + c.ORPHAN + c.HEX + c.LEGACY;
  console.log(
    `  ${lang.padEnd(3)} ${String(total).padStart(5)} файлов | ок ${String(c.OK).padStart(5)} | устарело ${String(c.STALE).padStart(3)} | без перевода ${String(c["NO-TRANSLATION"]).padStart(3)} | нет в POT ${String(c.ORPHAN).padStart(2)} | hex ${String(c.HEX).padStart(3)} | легаси ${String(c.LEGACY).padStart(3)}${bad ? "" : "  ✓"}`,
  );
}

const examples = rows.filter((r) => r.cls === "STALE").slice(0, 5);
if (examples.length) {
  console.log("\nпримеры устаревших:");
  for (const r of examples) console.log(`  ${r.file}\n    EN: ${(r.en ?? "").slice(0, 80)}`);
}
console.log(`\nотчёт: ${REPORT}`);
if (!DELETE && !DELETE_LEGACY) console.log("удалить устаревшие: --delete (легаси отдельно: --delete-legacy)");
