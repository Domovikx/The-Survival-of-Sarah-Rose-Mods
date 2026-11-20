/**
 * voice_migrate.mts — перенос корпуса на схему `{en12}-{state6} {variant}.opus`.
 *
 * Читает ОБА старых поколения имён (hex `{en16}__{state8}__{variant}` и легаси
 * `{uid32}__{variant}`) и пишет целевую base32-схему. Идемпотентен: файлы, уже
 * лежащие в целевой схеме, считаются «already».
 *
 * Зачем версия перевода из git: у существующих файлов мы не знаем, из какого
 * текста они сделаны. Берём последний коммит `po/<lang>.po` ДО mtime файла — так
 * имя остаётся честным: «файл сделан из ТОГО перевода». state6 считается по
 * текущему тону из POT (эмоции менялись редко и это отдельный класс отчёта).
 *
 * Запуск:
 *   node tools/generate/scripts/voice_migrate.mts --dry            # отчёт, ничего не трогает
 *   node tools/generate/scripts/voice_migrate.mts --apply          # переименовать
 *   node tools/generate/scripts/voice_migrate.mts --dry --lang ru  # только один язык
 *   ... --prune-empty                                              # + удалить файлы, которые
 *                                                                  #   нечем перевести и сейчас
 *                                                                  #   (мёртвая озвучка)
 *
 * Отчёт: tmp/voice_migrate.json (полный) + сводка в консоль.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parsePo } from "../../../../../.opencode/skills/renpy-po/po_core.mts";
import { hexStateHash, parseAnyVoiceName, voiceFileName } from "./voice_names.mts";

const AUDIO = join("patches", "ai-voice-pack", "audio");
const POT_PATH = join("patches", "ai-voice-pack", "po", "template.pot");
const PO_DIR = join("patches", "ai-voice-pack", "po");
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
/** Удалять файлы, которые нечем перевести И СЕЙЧАС (мёртвая озвучка). */
const PRUNE_EMPTY = args.includes("--prune-empty");
const langAt = args.indexOf("--lang");
const ONLY_LANG = langAt >= 0 ? args[langAt + 1] : undefined;

const md5 = (s: string): string => createHash("md5").update(s, "utf8").digest("hex");
const meta = (c: string[], p: string): string => (c.find((x) => x.startsWith(p)) ?? "").slice(p.length).trim();

type Report = {
  lang: string;
  file: string;
  reason: "rename" | "orphan" | "unknown-text" | "already" | "collision" | "prune" | "bench";
  to?: string;
  en?: string;
  text?: string;
  /** Из какой схемы пришло имя (hex — предыдущая, uid32 — легаси). */
  scheme?: string;
};

/**
 * Ключи POT под ОБОИМИ поколениями имён: uid32 (легаси, полный md5) и en16
 * (hex-схема). Переход идёт в одну сторону, поэтому мапа «входная».
 */
const pot = parsePo(readFileSync(POT_PATH, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);
const byUid = new Map<string, { en: string; emotion: string; key: string }>();
for (const e of pot) {
  const src = {
    en: e.msgid,
    emotion: meta(e.comments, "emotion_new:") || meta(e.comments, "emotion:"),
    // ключ po: msgctxt + msgid (одна и та же строка бывает у разных спикеров)
    key: `${e.msgctxt}\u0000${e.msgid}`,
  };
  byUid.set(md5(e.msgid), src);
  byUid.set(md5(e.msgid).slice(0, 16), src);
}

/** История po по языку: [(ms, hash)] по возрастанию времени. */
const historyCache = new Map<string, Array<{ ms: number; hash: string }>>();
const poHistory = (lang: string): Array<{ ms: number; hash: string }> => {
  const cached = historyCache.get(lang);
  if (cached) return cached;
  let list: Array<{ ms: number; hash: string }> = [];
  try {
    list = execSync(`git log --format=%ct_%H -- patches/ai-voice-pack/po/${lang}.po`)
      .toString()
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => {
        const [ct, hash] = l.split("_");
        return { ms: Number(ct) * 1000, hash: hash! };
      })
      .toSorted((a, b) => a.ms - b.ms);
  } catch {
    list = [];
  }
  historyCache.set(lang, list);
  return list;
};

const poTextCache = new Map<string, Map<string, string>>();
const poAt = (lang: string, hash: string): Map<string, string> => {
  const key = `${lang}:${hash}`;
  const cached = poTextCache.get(key);
  if (cached) return cached;
  const map = new Map<string, string>();
  try {
    const text = execSync(`git show ${hash}:patches/ai-voice-pack/po/${lang}.po`, {
      maxBuffer: 128 * 1024 * 1024,
    }).toString("utf-8");
    for (const e of parsePo(text.replace(/\r\n/g, "\n")))
      if (e.msgid) map.set(`${e.msgctxt}\u0000${e.msgid}`, e.msgstr);
  } catch {
    /* нет версии — останется пустой */
  }
  poTextCache.set(key, map);
  return map;
};

/** Текст перевода, действовавший в момент mtime файла. */
const textAt = (lang: string, key: string, msgid: string, mtimeMs: number): string => {
  if (lang === "en") return msgid; // en звучится по оригиналу
  const hist = poHistory(lang);
  if (!hist.length) return "";
  const version = [...hist].reverse().find((h) => h.ms <= mtimeMs) ?? hist[0]!;
  return poAt(lang, version.hash).get(key) ?? "";
};

/** Перевод СЕЙЧАС (текущий po) — по нему решаем, живой ли файл вообще. */
const currentPo = new Map<string, Map<string, string>>();
const textNow = (lang: string, key: string, msgid: string): string => {
  if (lang === "en") return msgid;
  let map = currentPo.get(lang);
  if (!map) {
    map = new Map<string, string>();
    const file = join(PO_DIR, `${lang}.po`);
    if (existsSync(file))
      for (const e of parsePo(readFileSync(file, "utf-8").replace(/\r\n/g, "\n")))
        if (e.msgid) map.set(`${e.msgctxt}\u0000${e.msgid}`, e.msgstr);
    currentPo.set(lang, map);
  }
  return map.get(key) ?? "";
};

const report: Report[] = [];
const summary: Record<string, Record<string, number>> = {};
let renamed = 0;
let pruned = 0;
let skipped = 0;

for (const lang of readdirSync(AUDIO)) {
  const langDir = join(AUDIO, lang);
  if (!statSync(langDir).isDirectory()) continue;
  if (ONLY_LANG && lang !== ONLY_LANG) continue;
  summary[lang] = summary[lang] ?? {
    "rename": 0,
    "orphan": 0,
    "unknown-text": 0,
    "already": 0,
    "collision": 0,
    "prune": 0,
    "bench": 0,
  };
  const seen = new Map<string, string>();

  for (const arc of readdirSync(langDir)) {
    const arcDir = join(langDir, arc);
    if (!statSync(arcDir).isDirectory()) continue;
    for (const file of readdirSync(arcDir)) {
      const parsed = parseAnyVoiceName(file);
      if (!parsed) continue;
      if (parsed.scheme === "base32") {
        // Уже в целевой схеме: второй прогон идемпотентен.
        summary[lang]!.already!++;
        continue;
      }
      const { scheme, en: uid, state: stateInName, variant } = parsed;
      // БЕНЧ-ФАЙЛ (`{uid}__{voice}__Vox_cfg...`) — НЕ легаси-корпус: звук сделан
      // другим конфигом, а имя получило бы вид «канонического». Не переименовываем
      // (2026-11-20: так чуть не легализовали 1 851 файл с cfg 2.6).
      if (file.includes("__Vox")) {
        summary[lang]!.bench!++;
        report.push({ lang, file: `${lang}/${arc}/${file}`, reason: "bench" });
        continue;
      }
      // Текст перевода НЕ берём из имени: state8 есть только у hex-схемы, а
      // легаси его не хранит вовсе. Единственный честный источник для обоих —
      // версия po на момент mtime файла (см. textAt).
      void stateInName;
      const src = byUid.get(uid);
      const rel = `${lang}/${arc}/${file}`;
      if (!src) {
        summary[lang]!.orphan!++;
        report.push({ lang, file: rel, reason: "orphan" });
        continue;
      }
      const mtimeMs = statSync(join(arcDir, file)).mtimeMs;
      let text = textAt(lang, src.key, src.en, mtimeMs);
      if (!text.trim()) {
        // Версии po на момент mtime нет. Но state8 в имени — это ровно то, ЧТО
        // было записано: если он совпадает с текущим переводом, файл актуален и
        // переименовывается честно (иначе решить нечем — имя необратимо).
        const now = textNow(lang, src.key, src.en);
        if (scheme === "hex" && now.trim() && stateInName === hexStateHash(now, src.emotion)) text = now;
      }
      if (!text.trim()) {
        // Перевести имя нечем: файл сделан из текста, которого уже нет ни в
        // одной версии po. Если перевода нет и СЕЙЧАС — файл мёртв навсегда
        // (играть его нечем), и --prune-empty его удаляет; иначе оставляем
        // отчёт (легаси-имена ждут переозвучки).
        if (PRUNE_EMPTY && !textNow(lang, src.key, src.en).trim()) {
          summary[lang]!.prune!++;
          report.push({ lang, file: rel, reason: "prune", en: src.en, scheme });
          if (APPLY) {
            rmSync(join(arcDir, file), { force: true });
            pruned++;
          }
          continue;
        }
        summary[lang]!["unknown-text"]!++;
        report.push({ lang, file: rel, reason: "unknown-text", en: src.en, scheme });
        continue;
      }
      const ext = file.slice(file.lastIndexOf(".") + 1);
      const next = voiceFileName({ en: src.en, variant, spoken: text, emotion: src.emotion }).replace(
        /\.opus$/,
        `.${ext}`,
      );
      const target = `${arc}/${next}`;
      if (seen.has(target)) {
        summary[lang]!.collision!++;
        report.push({ lang, file: rel, reason: "collision", to: `${lang}/${target}` });
        continue;
      }
      seen.set(target, rel);
      summary[lang]!.rename!++;
      report.push({ lang, file: rel, reason: "rename", to: `${lang}/${target}`, text, scheme });
      if (APPLY) {
        renameSync(join(arcDir, file), join(arcDir, next));
        renamed++;
      } else skipped++;
    }
  }
}

writeFileSync(join("tmp", "voice_migrate.json"), `${JSON.stringify(report, null, 1)}\n`, "utf-8");

console.log(`=== ${APPLY ? "МИГРАЦИЯ" : "dry-run"}: файлов к переименованию ${skipped || renamed}`);
for (const [lang, s] of Object.entries(summary)) {
  console.log(
    `  ${lang.padEnd(3)} переименовать ${String(s.rename).padStart(5)} | уже целевая ${String(s.already).padStart(4)} | без строки в POT ${String(s.orphan).padStart(3)} | без перевода ${String(s["unknown-text"]).padStart(3)} | мёртвых удалить ${String(s.prune).padStart(3)} | коллизий ${s.collision} | бенч (не трогаем) ${String(s.bench ?? 0).padStart(2)}`,
  );
}
if (pruned) console.log(`удалено мёртвых файлов (--prune-empty): ${pruned}`);
console.log(`отчёт: tmp/voice_migrate.json${APPLY ? "" : " (dry — ничего не менялось)"}`);
if (!APPLY && existsSync(join("tmp", "voice_migrate.json"))) console.log("применить: --apply");
