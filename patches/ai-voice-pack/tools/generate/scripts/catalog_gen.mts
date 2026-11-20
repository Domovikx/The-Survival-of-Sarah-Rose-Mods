/**
 * catalog_gen.mts — сборочные рантайм-мапы дистрибутива (2026-10-22:
 * каталог-легаси выпищен — в git не живёт НИ ОДИН производный каталог).
 *
 * label_arc.json   label -> Arc ИЗ ИНВЕНТАРЯ шаблона po/template.pot
 *                  (блок `#. label-map:` — полный список сюжетных лейблов;
 *                  scene-комментарии неполны: дедуп схлопывает сцены без
 *                  уникальных строк). Правила «лейбл → арка» — в potgen.mts.
 * voice_list.json  имена озвученных -> variant ИЗ casts/voices.mts (VOICES:
 *                  озвучен = активный реф {Имя}.wav; narrator = реф Narrator).
 *                  by_who в рантайм не читается (voice_config.rpy берёт
 *                  только names+narrator) — выпищен вместе с каталогом.
 * progress.json    СКОЛЬКО ПЕРЕВЕДЕНО И ОЗВУЧЕНО по языкам (2026-11-14):
 *                  игрок должен видеть, что это ДЕМО, а не полная локализация.
 *                  Считается здесь, а не в игре: рантайм не должен читать
 *                  po/ и обходить тысячи файлов ради двух чисел в меню.
 *
 * Оба файла — АРТЕФАКТЫ СБОРКИ: кладёт в .7z build_pack.mts, в репе не живут.
 *
 * Запуск: node catalog_gen.mts --out-dir <каталог>
 * Падает с ненулевым кодом и понятной ошибкой: нет POT / пуст инвентарь /
 * битая строка label-map / пустые войсы (build_pack.mts не даёт собрать архив
 * с отсутствующим/неполным каталогом — контракт приёмки edge-кейса).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseLabelMap } from "../../../../../.opencode/skills/renpy-po/potgen.mts";
import { VOICES } from "../../../casts/voices.mts";
import { isCorpusName } from "./voice_names.mts";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
/** patches/ai-voice-pack */
export const PKG_ROOT = join(SCRIPTS_DIR, "..", "..", "..");
export const POT_FILE = join(PKG_ROOT, "po", "template.pot");

/** Разумный минимум инвентаря (факт игры: 247 сюжетных лейблов). */
const MIN_LABELS = 100;
/** Разумный минимум озвученных голосов (факт кастов: 77). */
const MIN_VOICES = 10;

/** Сортировка ключей — детерминизм zip-сборки (паритет python sort_keys). */
function sortKeys<T>(obj: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** label -> Arc из инвентаря шаблона. Битый/отсутствующий POT — фатально. */
export function buildLabelArc(potFile: string = POT_FILE, minLabels: number = MIN_LABELS): Record<string, string> {
  if (!existsSync(potFile)) {
    throw new Error(`нет шаблона ${potFile} — запусти npm run potgen (POT = единственный источник мапы)`);
  }
  const map = parseLabelMap(readFileSync(potFile, "utf-8"));
  const n = Object.keys(map).length;
  if (n < minLabels) {
    throw new Error(
      `label-map почти пуст (${n} лейблов, минимум ${minLabels}) — битый template.pot? запусти npm run potgen`,
    );
  }
  return sortKeys(map);
}

/** Рантайм-мапа голосов из casts/voices.mts (VOICES = активные рефы). */
export function buildVoiceList(): Record<string, unknown> {
  const names: Record<string, string> = {};
  for (const [name, rel] of Object.entries(VOICES as Record<string, string | null>)) {
    if (rel) names[name] = name;
  }
  const n = Object.keys(names).length;
  if (n < MIN_VOICES) {
    throw new Error(`войсов почти нет (${n}) — casts/voices.mts не импортируется?`);
  }
  if (!names["Narrator"]) {
    throw new Error("нет рефа Narrator — наррация (43k строк) останется без голоса");
  }
  return {
    names: sortKeys(names),
    narrator: names["Narrator"] ?? "",
  };
}

/**
 * Языки для progress.json — из КАНОНА порядка (config/language-priority.json),
 * а не списком в коде: правило проекта — любой список языков идёт в этом
 * порядке. Берём только те, у кого есть po (en считается отдельно как источник).
 */
function progressLangs(): string[] {
  const canonPath = join(PKG_ROOT, "..", "..", "config", "language-priority.json");
  const canon = JSON.parse(readFileSync(canonPath, "utf-8")) as { languages: { code: string }[] };
  return canon.languages
    .map((l) => l.code)
    .filter((code) => code !== "en" && existsSync(join(PKG_ROOT, "po", `${code}.po`)));
}

/** Рекурсивный счёт .opus/.wav (без внешних зависимостей). */
function countAudio(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) n += countAudio(full);
    // Только имена по контракту: бенч-файлы (`uid__voice__Vox...`) движок не
    // находит, и в меню мода они не «озвучка» (2026-11-20).
    else if ((entry.name.endsWith(".opus") || entry.name.endsWith(".wav")) && isCorpusName(entry.name)) n += 1;
  }
  return n;
}

/**
 * Сколько переведено и озвучено по языкам — для честного предупреждения «демо».
 * Считаем ЗДЕСЬ, на сборке: рантайму нельзя читать po/ и обходить тысячи файлов
 * ради двух чисел в меню (и в паке po/ всё равно нет).
 */
export function buildProgress(pkgRoot: string = PKG_ROOT): {
  generated: string;
  total: number;
  langs: Record<string, { translated: number; voiced: number }>;
} {
  const pot = readFileSync(join(pkgRoot, "po", "template.pot"), "utf-8");
  // total = все msgid шаблона (тот же счёт, что показывает po:check)
  const total = (pot.match(/^msgid "(?!")/gm) ?? []).length;
  if (!total) throw new Error("progress: пустой template.pot — запусти npm run potgen");

  const langs: Record<string, { translated: number; voiced: number }> = {};
  for (const lang of progressLangs()) {
    const poPath = join(pkgRoot, "po", `${lang}.po`);
    let translated = 0;
    if (existsSync(poPath)) {
      const po = readFileSync(poPath, "utf-8");
      // перевод = непустой msgstr (пустая строка = ещё не переведено)
      translated = (po.match(/^msgstr "(?!")/gm) ?? []).length;
    }
    langs[lang] = { translated, voiced: countAudio(join(pkgRoot, "audio", lang)) };
  }
  // en — источник: текст полный по определению
  langs.en = { translated: total, voiced: countAudio(join(pkgRoot, "audio", "en")) };

  return { generated: new Date().toISOString().slice(0, 10), total, langs };
}

/** Пишет JSON в out-dir; любая ошибка -> throw (build_pack.mts ловит и валит сборку). */
export function generate(outDir: string): {
  labelArc: string;
  voiceList: string;
  progress: string;
  labels: number;
  voices: number;
} {
  const labelArc = buildLabelArc();
  const voiceList = buildVoiceList();
  const progress = buildProgress();
  mkdirSync(outDir, { recursive: true });
  const arcPath = join(outDir, "label_arc.json");
  const vlPath = join(outDir, "voice_list.json");
  const pgPath = join(outDir, "progress.json");
  writeFileSync(arcPath, JSON.stringify(labelArc, null, 1) + "\n", "utf-8");
  writeFileSync(vlPath, JSON.stringify(voiceList, null, 1) + "\n", "utf-8");
  writeFileSync(pgPath, JSON.stringify(progress, null, 1) + "\n", "utf-8");
  return {
    labelArc: arcPath,
    voiceList: vlPath,
    progress: pgPath,
    labels: Object.keys(labelArc).length,
    voices: Object.keys((voiceList as { names: object }).names).length,
  };
}

function main(argv: string[]): void {
  const outFlag = argv.indexOf("--out-dir");
  const outDir = outFlag >= 0 ? argv[outFlag + 1] : undefined;
  if (!outDir) {
    console.error("Usage: node catalog_gen.mts --out-dir <каталог>");
    process.exit(1);
  }
  try {
    const r = generate(outDir);
    console.log(
      `catalog: label_arc.json — ${r.labels} лейблов; voice_list.json — ${r.voices} голосов; progress.json -> ${outDir}`,
    );
  } catch (e) {
    console.error(`CATALOG_GEN ERROR: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
