/**
 * potgen.mts — EN-шаблон POT (template.pot) для TSSR из Ren'Py-исходников.
 *
 * Аналог NeonTranslator/potgen.py, но источник — не дамп Unity, а скрипты
 * игры <game>/game/*.rpy (по умолчанию Steam-установка TSSR, см. --game).
 * Единственный инструмент, который пишет po/template.pot; руками не править.
 *
 * Контексты (по аналогии с Neon, msgctxt дисамбигует одинаковые реплики):
 *   speaker:<Имя>  — реплика персонажа: define Display Name > строковое имя
 *                    > идентификатор, если define не найден;
 *   speaker:Narrator — нарратор (голые кавычки). Оформлен как спикер, потому
 *                    что для озвучки Narrator — полноценный голос (casts/
 *                    Narrator, who_to_voice['narrator']); инвариант: speaker:*
 *                    = озвучиваемо, остальное = не-речь;
 *   menu           — варианты меню (пункт «выбора»);
 *   speaker-name   — имена персонажей (Character("Имя") / "Имя" "текст");
 *   ui             — интерфейсные _("...").
 *
 * Дедуп по (msgid, msgctxt): одна строка переводится один раз — реплики
 * «Hello» у Sarah и Kate живут раздельно (разные контексты), повторы того же
 * текста у того же спикера схлопываются. Сортировка по (msgid, msgctxt) —
 * стабильные дифы. Однострочные экранированные записи (как в Neon).
 *
 * Известные ограничения парсера (взяты из проверенных правил
 * renpy-extract/voice_catalog): многострочные реплики и python-блоки внутри
 * label не разбираются; строка вида `return "text"` станет спикером
 * «return» — на практике в игре не встречается. Statement-ключи Ren'Py
 * (text/extend/voice/…) не бывают спикерами (гард SAY_KEYWORDS); screen-язык
 * `label <выражение>:` (screens.rpy History) не путается со скриптовым
 * label — тот живёт только на нулевом отступе. Say с атрибутами
 * (`s happy "текст"`) парсится, если идент — известный define.
 *
 * define Character собираются ДВУМЯ проходами (все define → затем реплики):
 * say-строки в файлах до источника define (replay_gallery/prosalaric vs
 * script.rpy) иначе утекают в спикеров-идентификаторов («s» вместо «Sarah»).
 *
 * Метаданные озвучки — комментарии `#.` (живут только в POT: ru.po их не
 * наследует, writer дропает — машинные данные, переводчику не мешают).
 * Порядок строк — по вложенности: арка ⊃ сцена ⊃ строка, затем uid и тон
 * (arc → scene → uid → emotion):
 *   #. arc: <Арка>         — арка текущего label записи: выводится при
 *                           скане ИЗ САМОЙ ИГРЫ (имена лейблов, таблица
 *                           правил ARC_BY_LABEL/ARC_BY_PREFIX — никаких
 *                           внешних json). Роутинг аудио, когда POT работает
 *                           как мапа озвучки (папка
 *                           ai_voice/{lang}/{Arc}/{uid}__{variant}.opus);
 *                           неизвестные лейблы → Other; лейблы галереи
 *                           (art.rpy, replay_gallery.rpy) и splashscreen —
 *                           без арки (не сюжет). Первый label-владелец
 *                           записи побеждает (как arc в voices.jsonl).
 *   #. scene: <Сцена>      — label записи: тоньше арки (сцена = label
 *                           игры) — таргетинг --scene при точечной
 *                           перегенерации. Только сюжетные файлы, только
 *                           внутри label; якорь первый-побеждает —
 *                           семантика паритетна scene в voices.jsonl.
 *   #. uid: <md5(msgid)>  — наш id фразы = ключ каталога и суффикс аудио
 *                           (uid__Who.opus), мостик POT → аудио/эмоции;
 *   #. emotion: <тон>      — из catalog/emotions.json (ключ md5), только для
 *                           speaker:* и narration (меню/ui не озвучиваются).
 *
 * Запуск:
 *   node .opencode/skills/renpy-po/potgen.mts [--game DIR] [--out FILE]
 *         [--speakers FILE] [--emotions FILE] [--no-emotions]
 * Выход (ШАГ 1 пишет оба файла):
 *   patches/ai-voice-pack/po/template.pot           — EN-шаблон переводов;
 *   patches/ai-voice-pack/po/template.speakers.mts  — типизированный список
 *     спикеров POT (POT_SPEAKERS / PotSpeaker) для маппинга «спикер → голос».
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { normalizeText, poEscape } from "./po_core.mts";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SKILL_DIR, "..", "..", "..");

/** Steam-установка TSSR (read-only источник строк). Переопределяется --game/TSSR_GAME. */
const DEFAULT_GAME =
  process.env.TSSR_GAME ?? "C:/Program Files (x86)/Steam/steamapps/common/The Survival of Sarah Rose/game";
const DEFAULT_OUT = join(REPO_ROOT, "patches", "ai-voice-pack", "po", "template.pot");
/** Сосед POT: типизированный список спикеров (имя файла фиксировано). */
export const SPEAKERS_MTS_NAME = "template.speakers.mts";

/** Путь файла спикеров по пути POT-файла (лежат в одном каталоге). */
export function speakersMtsPath(potOut: string): string {
  return join(dirname(potOut), SPEAKERS_MTS_NAME);
}
/** Каталог эмоций (uid → тон): ключ = md5(EN-текста) = наш uid фразы. */
const DEFAULT_EMOTIONS = join(REPO_ROOT, "patches", "ai-voice-pack", "catalog", "emotions.json");

export const CTX_MENU = "menu";
export const CTX_SPEAKER_NAME = "speaker-name";
export const CTX_UI = "ui";
/** Каноничное имя нарратора: = casts/Narrator и who_to_voice['narrator']. */
export const NARRATOR = "Narrator";

export function speakerCtx(name: string): string {
  return `speaker:${name}`;
}

// ── Паттерны Ren'Py (порт voice_catalog.py: поддерживают экранированные
// кавычки внутри строк; гарды — из renpy-extract, фикс мусора парсера).
// Скриптовый label — ТОЛЬКО на нулевом отступе: screen-язык `label h.who:`
// (screens.rpy History) иначе включал sawLabel, и text "▸" утекал как спикер.
const RE_LABEL = /^label\s+([A-Za-z0-9_.]+)\s*:/;
const RE_DEFINE = /^define\s+(\w+)\s*=\s*Character\(\s*"([^"]+)"/;
const RE_MENU_START = /^menu\b/;
const RE_MENU_CHOICE = /^\s*"((?:[^"\\]|\\.)*)"\s*(?:if\b.*)?:\s*$/;
const RE_SAY_IDENT = /^\s*(\w+)\s+"((?:[^"\\]|\\.)*)"/;
/** Say с атрибутами изображения: s happy "текст" (строгий резолв — см. ветку1). */
const RE_SAY_ATTR = /^\s*(\w+)((?:\s+[a-z_]\w*)+)\s+"((?:[^"\\]|\\.)*)"/;
const RE_SAY_QUOTED = /^\s*"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)"/;
const RE_NARR = /^\s*"((?:[^"\\]|\\.)*)"\s*(?:nointeract|with\b.*)?\s*$/;
const RE_IMAGE = /^image\s+\S.*:\s*$/;
const RE_UI = /_\("([^"]*)"\)/g;
const RE_UI_SINGLE = /_\('([^']*)'\)/g;

/**
 * Statement-ключи Ren'Py, которые НЕ бывают спикерами: screen-элементы
 * (утечка через label-в-экране) и statement-ы с кавычкой после идентификатора.
 * return/jump/call сюда не входят — пин-тест закрепил их как «спикеров».
 */
const SAY_KEYWORDS = new Set([
  "text",
  "input",
  "imagebutton",
  "textbutton",
  "button",
  "hotspot",
  "label",
  "extend",
  "centered",
  "voice",
  "window",
  "nvl",
  "scene",
  "show",
  "hide",
  "image",
  "screen",
  "camera",
  "play",
  "stop",
  "queue",
  "pause",
  "translate",
]);

/** Декодирует экранирование строк Ren'Py (\" \n \\ и т.д.). */
export function rpyUnescape(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      const n = s[i + 1];
      out += n === "n" ? "\n" : n === "r" ? "\r" : n === "t" ? "\t" : n;
      i += 2;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** Одна запись шаблона. */
export interface PotEntry {
  msgid: string;
  msgctxt: string;
  n: number; // сколько раз встретилась в игре
  uid: string; // md5(msgid) — id фразы для каталога и суффикс аудиофайла
  emotion?: string; // тон из emotions.json (только speaker/narration)
  arc?: string; // арка текущего label (правила arcOfLabel) — роутинг аудио POT-мапы
  scene?: string; // label записи (сцена) — тоньше арки, таргетинг --scene
}

/** uid каталога и аудио = md5(текста): та же формула, что у catalog/emotions. */
export function uidOf(text: string): string {
  return createHash("md5").update(text, "utf8").digest("hex");
}

/** Нормаль label'а — паритет voice_catalog.norm_label (точки → подчёркивания). */
export function normLabel(label: string): string {
  return label.replace(/\./g, "_");
}

// ── Правила «лейбл → арка»: арка выводится ИЗ САМОЙ ИГРЫ (имена лейблов),
// никаких внешних json. Паритет с прежним label_arc.json проверен: 261/264
// лейбл в точности совпадает; три отклонения — фиксы артефактов его
// текст-резолва: VargaPath5 (был Prologue, структурно — VargaMarionPath),
// TrainingPathKate3 (был Other, семья TrainingPath*), prostitutealaric1
// (лейбл был не досчитан, тл-заголовок сцены — Arc: Other).

/** Файлы, чьи лейблы не несут сюжет (галерея/реплеи) — арка не ставится. */
const NO_ARC_FILES = /(?:^|[\\/])(?:art|replay_gallery)\.rpy$/;
/** Лейбл вне сюжета внутри сюжетного файла. */
const NO_ARC_LABELS = new Set(["splashscreen"]);

/** Точные лейблы без общей префиксной семьи. */
const ARC_BY_LABEL: ReadonlyMap<string, string> = new Map([
  // Семья имен Пролога/погребений — точные имена без общего префикса.
  ...[
    "ChooseThePath",
    "CoronationDay",
    "DayOfTheFuneral",
    "MeetingKateInTheGarden",
    "MeetingOnTheBattlements",
    "SarahAndThomasSpeak",
    "SarahsBedroomAfterFuneral",
    "SecondPartOfFuneral",
    "TheInsidePathBegins",
    "TheMorningAfterKate",
  ].map((l): readonly [string, string] => [l, "StoryBeginnings"]),
  ...["ChoosingAMentor", "GeneralPathBegins"].map((l): readonly [string, string] => [l, "Training"]),
  ...[
    "UnionDecisionLoop",
    "ASarahInTheParkWithGeorge1",
    "MercenaryQueen1",
    "MythranInvasion1",
    "Sakar1",
    "SarahExploresLethramHarbor1",
  ].map((l): readonly [string, string] => [l, "UnionKingdom"]),
  ...["FallOfLethram2"].map((l): readonly [string, string] => [l, "MagePath"]),
  ...["SarahAndNick1", "TailorRoute1"].map((l): readonly [string, string] => [l, "LifeInRahayal"]),
  ...["SarahLeavesLethram1"].map((l): readonly [string, string] => [l, "SailorArc"]),
  ...["GallowCreek1", "MariusMarriage", "UnmarriedGallowCreek"].map((l): readonly [string, string] => [l, "AlfredArc"]),
  ...["HyralTown"].map((l): readonly [string, string] => [l, "HyralArc"]),
  ...["TheBattleForTheCapital", "WarCouncil"].map((l): readonly [string, string] => [l, "WarArc"]),
]);

/** Префиксы лейблов → арка (case-sensitive: DemonArc1-3 ≠ Demonarc4/5 → Other). */
const ARC_BY_PREFIX: ReadonlyArray<readonly [string, string]> = [
  ["OpeningScene", "Prologue"],
  ["TrainingPath", "Training"],
  ["UnionKingdom", "UnionKingdom"],
  ["UnionLoop", "UnionKingdom"],
  ["MagePath", "MagePath"],
  ["MageInTheRuins", "MagePath"],
  ["WarriorPath", "WarriorPath"],
  ["WarriorQueen", "WarriorPath"],
  ["WarriorRahayal", "WarriorPath"],
  ["HassarPath", "HassarPath"],
  ["JaeidPath", "HassarPath"],
  ["VargaPath", "VargaMarionPath"],
  ["MarionPath", "VargaMarionPath"],
  ["LifeInRahayal", "LifeInRahayal"],
  ["ServantOfGilead", "LifeInRahayal"],
  ["SailorPath", "SailorPath"],
  ["TheOldRoad", "SailorArc"],
  ["CampSlavePath", "AlfredArc"],
  ["PrisonPath", "PrisonArc"],
  ["UnderworldPath", "PrisonArc"],
  ["OutsideAndAlone", "PrisonArc"],
  ["TheHollowWorld", "HollowWorld"],
  ["HyralGoblin", "HyralArc"],
  ["HyralOrc", "HyralArc"],
  ["DemonArc", "DemonArc"],
  ["TheBlackMonolith", "BlackMonolith"],
];

/**
 * Арка лейбла: точное имя → префикс → fallback Other (вне сюжета вроде
 * gallery/replay исключены на уровне файла до вызова — см. NO_ARC_FILES).
 * undefined — лейбл не несёт арки (splashscreen).
 */
export function arcOfLabel(label: string): string | undefined {
  if (NO_ARC_LABELS.has(label)) return undefined;
  const exact = ARC_BY_LABEL.get(label);
  if (exact !== undefined) return exact;
  for (const [prefix, arc] of ARC_BY_PREFIX) {
    if (label.startsWith(prefix)) return arc;
  }
  return "Other";
}

export interface PotStats {
  files: number;
  scanned: number; // разобранных строк
  byContext: Record<string, number>; // уникальных записей по контекстам
  mergedDupes: number; // схлопнутых повторов (тот же msgid+msgctxt)
  normTwins: number; // семьи «похожих на нормаль» строк (будущий prefill)
  defines: number; // найденных define Character
}

export interface PotCatalog {
  entries: Map<string, PotEntry>; // ключ: `${msgctxt}\0${msgid}`
  stats: PotStats;
}

function entryKey(msgctxt: string, msgid: string): string {
  return `${msgctxt}\u0000${msgid}`;
}

/** Рекурсивно собирает .rpy файлы (мимо tl/ и скрытых каталогов), по возрастанию. */
export function collectRpyFiles(gameDir: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    let dirents;
    try {
      dirents = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      const full = join(dir, d.name);
      if (d.isDirectory()) {
        // tl — переводы, mods — установленные моды (в т.ч. наш: их rpy
        // не должны попадать в POT — спикеры только из оригинальной игры),
        // renpy — движок Ren'Py (его common/*.rpy дают фейковых «спикеров»
        // вроде if/style — это не реплики игры).
        if (d.name === "tl" || d.name === "mods" || d.name === "renpy" || d.name.startsWith(".")) continue;
        walk(full);
      } else if (d.isFile() && d.name.endsWith(".rpy")) {
        files.push(full);
      }
    }
  };
  walk(gameDir);
  return files.sort();
}

/** Проход 1: только define-имена — карта резолва должна жить до парсинга реплик. */
function collectDefines(filePath: string, defineDisplay: Record<string, string>): void {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return;
  }
  for (const line of content.split("\n")) {
    const m = RE_DEFINE.exec(line.trim());
    if (m) defineDisplay[m[1]] = m[2];
  }
}

/**
 * Разбирает один .rpy файл: say/menu/нарратив/имена/UI-строки.
 *
 * Гарды (перенесены из renpy-extract, фикс 2026-10-19):
 *   sawLabel     — say/нарратив только внутри label (screen-вызовы
 *                  `text "..."` снаружи не парсятся);
 *   imageIndent  — внутри image/ATL-блоков кавычки — ассеты, не строки;
 *   inMenu       — пункты меню только пока отступлены.
 */
export function parseRpyFile(filePath: string, catalog: PotCatalog, defineDisplay: Record<string, string>): void {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return;
  }
  // Лейблы галерейных файлов не несут сюжет — их строки без арки.
  const noArc = NO_ARC_FILES.test(filePath);

  // Текущий label: арка каждой записи — отсюда (сбрасывается на нулевом
  // отступе: тело label всегда отступлено).
  let currentLabel: string | null = null;

  const add = (msgid: string, msgctxt: string): void => {
    if (!msgid) return;
    // Арка и сцена — от текущего label (сюжетные файлы; галереи — без них).
    const lab = currentLabel !== null && !noArc ? normLabel(currentLabel) : undefined;
    const arc = lab !== undefined ? arcOfLabel(lab) : undefined;
    const key = entryKey(msgctxt, msgid);
    const slot = catalog.entries.get(key);
    if (slot) {
      slot.n += 1;
      catalog.stats.mergedDupes += 1;
      // Дедуп: первый label-владелец побеждает (как arc в voices.jsonl);
      // пустой якорь добирается, если более поздняя встреча внутри label.
      if (!slot.arc && arc !== undefined) slot.arc = arc;
      if (!slot.scene && lab !== undefined) slot.scene = lab;
    } else {
      catalog.entries.set(key, { msgid, msgctxt, n: 1, uid: uidOf(msgid), arc, scene: lab });
    }
  };

  const lines = content.split("\n");
  let sawLabel = false;
  let inMenu = false;
  let imageIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = raw.trim();
    if (!stripped || stripped.startsWith("#")) continue;
    catalog.stats.scanned += 1;
    const indent = (raw.match(/^[ \t]*/) ?? [""])[0].replace(/\t/g, "    ").length;
    if (imageIndent >= 0 && indent <= imageIndent) imageIndent = -1;

    // Label — граница «мы внутри сюжета». Только нулевой отступ (см. RE_LABEL).
    // ВАЖНО (реальная игра, script.rpy): тела label у автора БЕЗ отступа
    // (`label X:` → реплики на нулевом отступе) — якорь держится до СЛЕДУЮЩЕГО
    // label, не сбрасывается по отступу (паритет гарда sawLabel).
    let m = RE_LABEL.exec(raw);
    if (m) {
      sawLabel = true;
      inMenu = false;
      currentLabel = m[1];
      continue;
    }

    // Image/ATL-блок: тело не разбираем до выхода по отступу.
    if (RE_IMAGE.test(stripped)) {
      imageIndent = indent;
      continue;
    }

    // Меню: вход.
    if (RE_MENU_START.test(stripped)) {
      inMenu = true;
      continue;
    }

    // Меню: выход (дедент не-комментария).
    if (inMenu && !/^[ \t]/.test(raw)) inMenu = false;

    // define <id> = Character("Имя") — карта имён + запись speaker-name.
    m = RE_DEFINE.exec(stripped);
    if (m) {
      defineDisplay[m[1]] = m[2];
      catalog.stats.defines += 1;
      add(m[2], CTX_SPEAKER_NAME);
      continue;
    }

    // 1. Реплика с идентификатором: s "текст" (statement-ключи — не спикеры).
    m = RE_SAY_IDENT.exec(stripped);
    if (m && sawLabel && imageIndent < 0 && !SAY_KEYWORDS.has(m[1])) {
      const text = rpyUnescape(m[2]);
      if (text && !text.startsWith("#")) {
        add(text, speakerCtx(defineDisplay[m[1]] ?? m[1]));
      }
      continue;
    }

    // 1b. Say с атрибутами изображения: s happy "текст" — только если идент
    // известен как define (imagebutton idle "ассет" так не утечёт).
    m = RE_SAY_ATTR.exec(stripped);
    if (m && sawLabel && imageIndent < 0 && defineDisplay[m[1]]) {
      const text = rpyUnescape(m[3]);
      if (text && !text.startsWith("#")) add(text, speakerCtx(defineDisplay[m[1]]));
      continue;
    }

    // 2. Реплика со строковым спикером: "Orc" "текст".
    m = RE_SAY_QUOTED.exec(stripped);
    if (m && sawLabel && imageIndent < 0) {
      const char = rpyUnescape(m[1]);
      const text = rpyUnescape(m[2]);
      if (text && !text.startsWith("#")) add(text, speakerCtx(char));
      if (char) add(char, CTX_SPEAKER_NAME);
      continue;
    }

    // 3. Нарратор: "текст" — контекст speaker:Narrator (озвучиваемый голос).
    m = RE_NARR.exec(stripped);
    if (m && sawLabel && imageIndent < 0) {
      const text = rpyUnescape(m[1]);
      if (text) add(text, speakerCtx(NARRATOR));
      continue;
    }

    // 4. Пункт меню: "Выбор": (в т.ч. с условиями `if ...`).
    if (inMenu) {
      m = RE_MENU_CHOICE.exec(stripped);
      if (m) {
        const text = rpyUnescape(m[1].trim());
        if (text && text !== "Choose") add(text, CTX_MENU);
        continue;
      }
    }

    // 5. UI: _("...") catch-all.
    for (const re of [RE_UI, RE_UI_SINGLE]) {
      re.lastIndex = 0;
      let um: RegExpExecArray | null;
      while ((um = re.exec(stripped)) !== null) {
        if (um[1]) add(um[1], CTX_UI);
      }
    }
  }
}

/** Опции сканирования (метаданные озвучки для комментариев POT). */
export interface ScanOptions {
  emotions?: Record<string, string>; // md5(msgid) -> тон (catalog/emotions.json)
}

/** Строит каталог POT по всем .rpy в gameDir. */
export function scanGame(gameDir: string, opts: ScanOptions = {}): PotCatalog {
  const catalog: PotCatalog = {
    entries: new Map(),
    stats: {
      files: 0,
      scanned: 0,
      byContext: {},
      mergedDupes: 0,
      normTwins: 0,
      defines: 0,
    },
  };
  const defineDisplay: Record<string, string> = {};
  const files = collectRpyFiles(gameDir);
  catalog.stats.files = files.length;
  // Проход 1: define всех файлов; Проход 2: разбор строк (см. шапку файла).
  for (const f of files) collectDefines(f, defineDisplay);
  for (const f of files) parseRpyFile(f, catalog, defineDisplay);

  // Счётчики по контекстам (нарратор — отдельная группа «narration» для
  // преемственности отчётов) + семьи «похожих» строк (для будущего prefill:
  // normalizeText-твин унаследует перевод ровно одного варианта).
  const byNorm = new Map<string, Set<string>>();
  for (const e of catalog.entries.values()) {
    const group =
      e.msgctxt === speakerCtx(NARRATOR) ? "narration" : e.msgctxt.startsWith("speaker:") ? "dialogue" : e.msgctxt;
    catalog.stats.byContext[group] = (catalog.stats.byContext[group] ?? 0) + 1;
    const norm = normalizeText(e.msgid);
    if (!norm) continue;
    let fam = byNorm.get(norm);
    if (!fam) byNorm.set(norm, (fam = new Set()));
    fam.add(e.msgid);
  }
  catalog.stats.normTwins = [...byNorm.values()].filter((s) => s.size > 1).length;

  // Эмоции: только озвучиваемые (инвариант speaker:* = озвучиваемо, теперь
  // включая Narrator; меню/ui/имена — не речь, их ключей в emotions.json нет).
  if (opts.emotions) {
    for (const e of catalog.entries.values()) {
      const em = opts.emotions[e.uid];
      if (em && e.msgctxt.startsWith("speaker:")) {
        e.emotion = em;
      }
    }
  }
  return catalog;
}

/** Рендерит каталог в текст template.pot (заголовок + записи, отсортированные). */
export function renderPot(catalog: PotCatalog, now: Date = new Date()): string {
  const ts = now.toISOString().slice(0, 16).replace("T", " ") + "+0000";
  const out: string[] = [
    "# TSSR EN template (generated by potgen.mts — do not edit).",
    "# Translate by copying to po/ru.po and filling msgstr.",
    'msgid ""',
    'msgstr ""',
    '"Project-Id-Version: TSSR-Mods 1.0\\n"',
    `"POT-Creation-Date: ${ts}\\n"`,
    '"Content-Type: text/plain; charset=UTF-8\\n"',
    '"Content-Transfer-Encoding: 8bit\\n"',
    "",
  ];
  const sorted = [...catalog.entries.values()].sort(
    (a, b) =>
      (a.msgid < b.msgid ? -1 : a.msgid > b.msgid ? 1 : 0) ||
      (a.msgctxt < b.msgctxt ? -1 : a.msgctxt > b.msgctxt ? 1 : 0),
  );
  for (const e of sorted) {
    if (e.arc) out.push(`#. arc: ${e.arc}`);
    if (e.scene) out.push(`#. scene: ${e.scene}`);
    out.push(`#. uid: ${e.uid}`);
    if (e.emotion) out.push(`#. emotion: ${e.emotion}`);
    out.push(`msgctxt "${poEscape(e.msgctxt)}"`);
    out.push(`msgid "${poEscape(e.msgid)}"`);
    out.push('msgstr ""');
    out.push("");
  }
  return out.join("\n").replace(/\n+$/, "") + "\n";
}

/** Спикеры POT (msgctxt "speaker:*") без префикса, без дублей, отсортированы. */
export function potSpeakerNames(catalog: PotCatalog): string[] {
  const names = new Set<string>();
  for (const e of catalog.entries.values()) {
    if (e.msgctxt.startsWith("speaker:")) names.add(e.msgctxt.slice("speaker:".length));
  }
  return [...names].sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * Статистика реплик по спикерам: имя -> СКОЛЬКО раз спикер говорит в игре.
 * Сумма n по всем записям спикера (n = сколько раз пара «текст+спикер»
 * встретилась в .rpy; одинаковые тексты схлопнуты, но n их считает).
 */
export function potSpeakerLineCounts(catalog: PotCatalog): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of catalog.entries.values()) {
    if (!e.msgctxt.startsWith("speaker:")) continue;
    const name = e.msgctxt.slice("speaker:".length);
    counts[name] = (counts[name] ?? 0) + e.n;
  }
  return counts;
}

/**
 * Рендерит каталог в текст template.speakers.mts (генерится тем же прогоном,
 * что POT; формат — prettier-конфиг репы, прогон идемпотентен).
 */
export function renderSpeakersMts(catalog: PotCatalog): string {
  const counts = potSpeakerLineCounts(catalog);
  const out: string[] = [
    "/**",
    " * template.speakers.mts — СПИСОК СПИКЕРОВ template.pot (генерится potgen.mts, руками не править).",
    " *",
    ' * Каждое имя — префикс msgctxt "speaker:*" из POT: канонические имена',
    " * спикеров игры (кто говорит). Значение — сколько раз спикер говорит",
    " * в игре (сумма повторов всех его реплик; статистика для ревью озвучки).",
    " * Это НЕ войсы (чьим голосом говорит): войсы — casts/voices.mts",
    " * (генерится из папок casts/), мапа «спикер → голос» — рукописная",
    " * casts/casts.mts (ключи SPEAKERS — тип PotSpeaker отсюда: полное",
    " * покрытие проверяет компилятор). Тут — эталонный список спикеров.",
    " */",
    "",
    "export const POT_SPEAKERS = {",
  ];
  // Сортировка: по убыванию количества реплик (главные персонажи сверху),
  // при равенстве — по алфавиту (детерминированный вывод).
  const sorted = potSpeakerNames(catalog).sort((a, b) => {
    const d = (counts[b] ?? 0) - (counts[a] ?? 0);
    return d !== 0 ? d : a.localeCompare(b, "en");
  });
  for (const n of sorted) out.push(`  ${JSON.stringify(n)}: ${counts[n] ?? 0},`);
  out.push("};");
  out.push("");
  out.push("export type PotSpeaker = keyof typeof POT_SPEAKERS;");
  out.push("");
  return out.join("\n");
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("Usage: node potgen.mts [--game DIR] [--out FILE] [--speakers FILE] [--emotions FILE] [--no-emotions]");
    return;
  }
  const gameFlag = argv.indexOf("--game");
  const outFlag = argv.indexOf("--out");
  const gameDir = gameFlag >= 0 ? argv[gameFlag + 1] : DEFAULT_GAME;
  const outFile = outFlag >= 0 ? argv[outFlag + 1] : DEFAULT_OUT;
  if (!gameDir || !outFile) {
    console.error("ERROR: --game/--out требуют значение (см. --help)");
    process.exit(1);
  }
  const spFlag = argv.indexOf("--speakers");
  const speakersFile = spFlag >= 0 ? argv[spFlag + 1] : speakersMtsPath(outFile);
  if (!speakersFile) {
    console.error("ERROR: --speakers требует значение (см. --help)");
    process.exit(1);
  }

  const emFlag = argv.indexOf("--emotions");
  const emPath = emFlag >= 0 ? argv[emFlag + 1] : DEFAULT_EMOTIONS;
  let emotions: Record<string, string> | undefined;
  if (!argv.includes("--no-emotions")) {
    if (!emPath) {
      console.error("ERROR: --emotions требует значение (см. --help)");
      process.exit(1);
    }
    try {
      emotions = JSON.parse(readFileSync(emPath, "utf-8")) as Record<string, string>;
    } catch (e) {
      console.warn(
        `WARN: не прочитан файл эмоций ${emPath} (${e instanceof Error ? e.message : String(e)}) — пишу без #. emotion:`,
      );
    }
  }

  const catalog = scanGame(gameDir, { emotions });
  const s = catalog.stats;
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, renderPot(catalog), "utf-8");
  mkdirSync(dirname(speakersFile), { recursive: true });
  writeFileSync(speakersFile, renderSpeakersMts(catalog), "utf-8");

  console.log(`POT: ${catalog.entries.size} уникальных записей из ${s.files} файлов -> ${outFile}`);
  console.log(`Speakers: ${potSpeakerNames(catalog).length} спикеров -> ${speakersFile}`);
  console.log(`  разобрано строк: ${s.scanned}, define Character: ${s.defines}`);
  for (const [ctx, n] of Object.entries(s.byContext).sort()) {
    console.log(`  ${ctx}: ${n}`);
  }
  console.log(`  схлопнуто повторов (тот же msgid+msgctxt): ${s.mergedDupes}`);
  console.log(`  normalizeText-семей >1 варианта (кандидаты prefill): ${s.normTwins}`);
  const withEmotion = [...catalog.entries.values()].filter((e) => e.emotion).length;
  console.log(
    `  с метаданными emotion: ${withEmotion} (ключей в файле: ${emotions ? Object.keys(emotions).length : 0})`,
  );
  const withArc = [...catalog.entries.values()].filter((e) => e.arc).length;
  const noArcCount = catalog.entries.size - withArc;
  const arcs = new Set([...catalog.entries.values()].map((e) => e.arc).filter((a): a is string => !!a));
  console.log(`  с метаданными arc: ${withArc} (${arcs.size} арок), без арки: ${noArcCount} (вне label/не-сюжет)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
