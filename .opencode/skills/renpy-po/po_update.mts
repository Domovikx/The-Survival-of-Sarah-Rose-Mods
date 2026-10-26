/**
 * po_update.mts — аналог msgmerge -U: освежает po/<lang>.po от template.pot.
 *
 * Цикл обновления игры («вышла новая версия»):
 *   1. npm run potgen    — template.pot перезаписывается ЦЕЛИКОМ. Это
 *      безопасно по построению: POT генерируемый и не содержит переводов
 *      (msgstr всегда ""), история изменений — в git, а актуальность
 *      закоммиченного файла бдит e2e-гард байт-в-байт;
 *   2. npm run po:update — переводы переносятся в новый POT по правилам
 *      NeonTranslator/po_update.py (порт):
 *      - exact (msgid, msgctxt) — перевод перенесён; комментарии НЕ течут
 *        (DRY 2026-10-23: тон/arc/scene/uid живут только в POT, обратный
 *        пайплайн — pot_resolve.mts по ключу msgctxt+msgid);
 *      - ключ исчез, но тот же EN-текст жив под другим контекстом
 *        (переклассификация спикера, narration -> speaker:Narrator) —
 *        перевод спасён ретаргетом с пометкой, чужой перевод не перетирается;
 *      - текст выпал из POT целиком — human-работа священна: запись
 *        остаётся live с флагом legacy (пустые исчезнувшие не жалеем);
 *      - новый ключ из POT — пустой msgstr;
 *      - никаких fuzzy-догадок: эвристики миграции — дело prefill.
 *
 * Запуск:
 *   node .opencode/skills/renpy-po/po_update.mts [--lang ru] [--po FILE] [--pot FILE]
 * Выход: po/<lang>.po перезаписан на месте (страховка — git, .bak не делаем).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parsePo, renderPo, writePoAtomic } from "./po_core.mts";
import type { PoEntry } from "./po_core.mts";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SKILL_DIR, "..", "..", "..");
const PO_DIR = join(REPO_ROOT, "patches", "ai-voice-pack", "po");
const DEFAULT_POT = join(PO_DIR, "template.pot");

export interface UpdateStats {
  carried: number; // перевод перенесён (точный ключ или ретаргет)
  retargeted: number; // из них спасено ретаргетом на другой контекст
  legacyKept: number; // текст выпал из POT — запись оставлена с флагом legacy
  newEntries: number; // ключей без перевода (новые или раньше пустые)
  droppedEmpty: number; // исчезнувших непереведённых (выкинуты)
}

export interface UpdateResult {
  entries: PoEntry[]; // записи без шапки, отсортированы (msgid, msgctxt)
  headerLines: string[]; // шапка исходного po (комментарии + msgid "")
  stats: UpdateStats;
}

const entryKey = (e: { msgctxt: string; msgid: string }): string => `${e.msgctxt}\u0000${e.msgid}`;

/** Шапка PO-файла: блок до первой пустой строки (комментарии + msgid ""). */
export function poHeaderLines(poText: string): string[] {
  // CRLF-безопасность: разделитель блоков "\n\n" не находится в CRLF-файле
  // (там "\r\n\r\n") — без нормализации split возвращал ВЕСЬ файл, и renderPo
  // склеивал старую копию с новой (инцидент с ru.po 2026-10-23).
  const text = poText.replace(/\r\n/g, "\n");
  return text.split("\n\n")[0].split("\n");
}

/**
 * Переносит переводы из poText в новый POT (potText). Ядро — порт
 * NeonTranslator po_update.merge_pot: спасение через текст под другим
 * контекстом, legacy-keep; комментарии POT в .po не копируются (DRY).
 */
export function mergePoUpdate(poText: string, potText: string): UpdateResult {
  const poEntries = parsePo(poText).filter((e) => e.msgid);
  const potEntries = parsePo(potText).filter((e) => e.msgid);
  const poMap = new Map(poEntries.map((e) => [entryKey(e), e]));
  const potKeys = new Set(potEntries.map(entryKey));
  const potByText = new Map<string, PoEntry[]>();
  for (const e of potEntries) {
    const list = potByText.get(e.msgid);
    if (list) list.push(e);
    else potByText.set(e.msgid, [e]);
  }

  const stats: UpdateStats = { carried: 0, retargeted: 0, legacyKept: 0, newEntries: 0, droppedEmpty: 0 };

  // Ретаргет: ключ исчез, EN-текст жив под другим контекстом, и ни один
  // кандидатский ключ не имеет перевода в PO (чужой перевод не перетираем).
  const translatedKeys = new Set(poEntries.filter((e) => e.msgstr).map(entryKey));
  const retargetFill = new Map<string, { msgstr: string; translator: string[] }>();
  for (const old of poEntries) {
    const k = entryKey(old);
    if (potKeys.has(k) || !old.msgstr) continue;
    const cands = (potByText.get(old.msgid) ?? []).filter((c) => !translatedKeys.has(entryKey(c)));
    if (!cands.length) continue;
    cands.sort((a, b) => (a.msgctxt < b.msgctxt ? -1 : a.msgctxt > b.msgctxt ? 1 : 0));
    retargetFill.set(entryKey(cands[0]), { msgstr: old.msgstr, translator: [...old.translator] });
    stats.retargeted += 1;
  }

  // Основной поток: каждая запись нового POT; метаданные (arc/scene/uid/
  // emotion) в .po НЕ копируются (DRY), перевод и переводческие пометы — из PO.
  const merged: PoEntry[] = [];
  for (const pe of potEntries) {
    const k = entryKey(pe);
    const old = poMap.get(k);
    const ret = retargetFill.get(k);
    const msgstr = old?.msgstr || ret?.msgstr || "";
    const translator = old?.translator ?? ret?.translator ?? [];
    merged.push({
      ...pe,
      msgstr,
      translator: [...translator],
      flags: (old?.flags ?? []).filter((f) => f !== "legacy"),
    });
    if (msgstr) stats.carried += 1;
    else stats.newEntries += 1;
  }

  // Исчезнувшие ключи с переводом: спасённые ретаргетом молча пропускаются,
  // остальные живут дальше как legacy (пустые исчезнувшие выкидываем).
  for (const old of poEntries) {
    const k = entryKey(old);
    if (potKeys.has(k)) continue;
    if (!old.msgstr) {
      stats.droppedEmpty += 1;
      continue;
    }
    if ((potByText.get(old.msgid) ?? []).length) continue; // спасён ретаргетом
    const keep: PoEntry = { ...old, flags: [...old.flags], translator: [...old.translator] };
    if (!keep.flags.includes("legacy")) {
      keep.flags.push("legacy");
      keep.translator.push("legacy: текста больше нет в POT, оставлен для рантайм-поиска");
    }
    merged.push(keep);
    stats.legacyKept += 1;
  }

  // Контракт языкового .po (DRY 2026-10-23): из POT в .po НЕ течёт НИЧЕГО —
  // ни тона, ни arc/scene/uid: машинные метаданные живут только в POT и
  // читаются обратным пайплайном pot_resolve.mts по ключу (msgctxt, msgid).
  for (const e of merged) {
    e.comments = [];
  }

  merged.sort(
    (a, b) =>
      (a.msgid < b.msgid ? -1 : a.msgid > b.msgid ? 1 : 0) ||
      (a.msgctxt < b.msgctxt ? -1 : a.msgctxt > b.msgctxt ? 1 : 0),
  );
  return { entries: merged, headerLines: poHeaderLines(poText), stats };
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("Usage: node po_update.mts [--lang ru] [--po FILE] [--pot FILE]");
    return;
  }
  const langFlag = argv.indexOf("--lang");
  const poFlag = argv.indexOf("--po");
  const potFlag = argv.indexOf("--pot");
  const lang = langFlag >= 0 ? argv[langFlag + 1] : "ru";
  const poPath = poFlag >= 0 ? argv[poFlag + 1] : join(PO_DIR, `${lang}.po`);
  const potPath = potFlag >= 0 ? argv[potFlag + 1] : DEFAULT_POT;
  if (!lang || !poPath || !potPath) {
    console.error("ERROR: --lang/--po/--pot требуют значение (см. --help)");
    process.exit(1);
  }

  const poText = readFileSync(poPath, "utf-8");
  const potText = readFileSync(potPath, "utf-8");
  const { entries, headerLines, stats } = mergePoUpdate(poText, potText);
  writePoAtomic(poPath, renderPo(entries, headerLines));
  const s = stats;
  console.log(`${poPath}: ${entries.length} записей после освежения от ${potPath}`);
  console.log(`  перенесено: ${s.carried} (из них ретаргет: ${s.retargeted})`);
  console.log(
    `  legacy-оставлено: ${s.legacyKept}, новых пустых: ${s.newEntries}, выпавших непереведённых: ${s.droppedEmpty}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
