/**
 * game_source.mts — ОБЩИЙ слой «файлы игры + правила арок» для потребителей,
 * которым не нужен весь potgen: арочный сканер arc-branching и сам potgen.
 *
 * Вынесен из potgen.mts (2026-10-29), чтобы разомкнуть цикл импортов
 * potgen <-> arc-branching (линтер import/no-cycle): теперь arc-branching
 * импортирует ЭТОТ модуль, а potgen — и модуль, и arc-branching (для puml).
 *
 * Правило «лейбл → арка»: арка выводится ИЗ САМОЙ ИГРЫ (имена лейблов),
 * никаких внешних json. Паритет с прежним label_arc.json проверен: 261/264
 * лейбл в точности совпадает; три отклонения — фиксы артефактов его
 * текст-резолва: VargaPath5 (был Prologue, структурно — VargaMarionPath),
 * TrainingPathKate3 (был Other, семья TrainingPath*), prostitutealaric1
 * (лейбл был не досчитан, тл-заголовок сцены — Arc: Other).
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Файлы, чьи лейблы не несут сюжет (галерея/реплеи) — арка не ставится.
 *  export для arc-branching (диаграмма читает файлы игры напрямую). */
export const NO_ARC_FILES = /(?:^|[\\/])(?:art|replay_gallery)\.rpy$/;
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
