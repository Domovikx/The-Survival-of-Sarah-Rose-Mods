/**
 * Одноразовый ЭКСПЕРИМЕНТ: симуляция апдейта игры и проверка жизненного
 * цикла po/ (uid + эмоции + переводы ru.po). Артефакты — только в tmp/.
 *
 * Сценарий «апдейта» на копии реальных .rpy:
 *   1. удаление реплики ("Voice" "Go to the ships!");
 *   2. ИЗМЕНЕНИЕ нарраторской строки (текст → другой → новый uid);
 *   3. добавление новой нарраторской строки.
 * Дальше: регенерация POT из копии (с джойном catalog/emotions.json) →
 * сверка uid/эмоций → merge реального ru.po через mergePoUpdate.
 *
 * Запуск: node tmp/exp_update_sim.mts
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import type { PoEntry } from "../.opencode/skills/renpy-po/po_core.mts";
import { renderPot, scanGame, speakerCtx } from "../.opencode/skills/renpy-po/potgen.mts";
import { mergePoUpdate } from "../.opencode/skills/renpy-po/po_update.mts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const GAME = process.env.TSSR_GAME ?? "C:/Program Files (x86)/Steam/steamapps/common/The Survival of Sarah Rose/game";
const POT_PATH = join(REPO, "patches", "ai-voice-pack", "po", "template.pot");
const RU_PATH = join(REPO, "patches", "ai-voice-pack", "po", "ru.po");
const EMOTIONS_PATH = join(REPO, "patches", "ai-voice-pack", "catalog", "emotions.json");

let failures = 0;
function check(label: string, cond: boolean, extra = ""): void {
  if (!cond) failures += 1;
  console.log(`  ${cond ? "✓" : "✗ FAIL"}: ${label}${extra ? ` — ${extra}` : ""}`);
}
const key = (e: { msgctxt: string; msgid: string }): string => `${e.msgctxt}\u0000${e.msgid}`;
const stripDate = (t: string): string => t.replace(/"POT-Creation-Date:[^"]*"/, "");
/** uid и эмоция из POT-записи (#. uid: / #. emotion: в comments). */
function cmt(e: PoEntry, prefix: string): string | undefined {
  return e.comments.find((c) => c.startsWith(prefix))?.slice(prefix.length);
}

// ── 1. Копия игры в tmp (граница установки: в игру ничего не пишем) ──────────
const simRoot = join(REPO, "tmp", "exp-update-sim");
const copyDir = join(simRoot, "game");
rmSync(simRoot, { recursive: true, force: true });
mkdirSync(copyDir, { recursive: true });
for (const f of readdirSync(GAME)) {
  if (f.endsWith(".rpy")) copyFileSync(join(GAME, f), join(copyDir, f));
}
const emotions = JSON.parse(readFileSync(EMOTIONS_PATH, "utf-8")) as Record<string, string>;
const committed = readFileSync(POT_PATH, "utf-8");

// ── 2. Детерминизм: копия без мутаций = закоммиченный POT ────────────────────
const pot0 = renderPot(scanGame(copyDir, { emotions }), new Date(0));
check("копия игры регенерирует закоммиченный POT байт-в-байт (без даты)", stripDate(pot0) === stripDate(committed));

const pot0Entries = parsePo(pot0).filter((e) => e.msgid);
const map0 = new Map(pot0Entries.map((e) => [key(e), e]));

// ── 3. Мутации «апдейта игры» в копии ────────────────────────────────────────
const sp = join(copyDir, "script.rpy");
let src = readFileSync(sp, "utf-8");

// 3а. УДАЛЕНИЕ: голосовая реплика Voice.
const DELETE_LINE = '"Voice" "Go to the ships!"';
check("якорь удаления на месте", src.includes(DELETE_LINE));
const delEntry = map0.get(`${speakerCtx("Voice")}\u0000Go to the ships!`);
check("удаляемая реплика есть в POT", !!delEntry);
src = src.replace(new RegExp(`^${DELETE_LINE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\r?\\n`, "m"), "");

// 3б. ИЗМЕНЕНИЕ: нарраторская строка С эмоцией, уникальная в script.rpy.
const target = pot0Entries.find(
  (e) =>
    e.msgctxt === speakerCtx("Narrator") &&
    cmt(e, "emotion: ") &&
    e.msgid.length > 40 &&
    !/[\\[\]{}]/.test(e.msgid) &&
    src.split(`"${e.msgid}"`).length === 2,
);
if (!target) throw new Error("не найдена нарраторская строка с эмоцией для изменения");
const NEW_TEXT = `${target.msgid} (v2)`;
src = src.replace(`"${target.msgid}"`, `"${NEW_TEXT}"`);

// 3в. ДОБАВЛЕНИЕ: новая нарраторская строка после первого label.
const NEW_LINE = "A brand new line that did not exist before.";
src = src.replace(/^(label [^\n]*:\r?\n)/m, `$1    "${NEW_LINE}"\n`);
writeFileSync(sp, src, "utf-8");

// ── 4. Регенерация POT из «обновлённой» игры ─────────────────────────────────
const pot2 = renderPot(scanGame(copyDir, { emotions }), new Date(0));
const pot2Entries = parsePo(pot2).filter((e) => e.msgid);
const map2 = new Map(pot2Entries.map((e) => [key(e), e]));

console.log("\n=== UID при апдейте игры ===");
// Неизменённые фразы: ключ есть в обоих POT → uid обязан совпадать.
let common = 0;
let uidStable = 0;
for (const [k, e] of map0) {
  const e2 = map2.get(k);
  if (!e2) continue;
  common += 1;
  if (cmt(e2, "uid: ") === cmt(e, "uid: ")) uidStable += 1;
}
check("неизменённые фразы сохранили uid", common === uidStable, `${uidStable}/${common}`);

const delKey = key(delEntry!);
check("удалённая реплика ВЫПАЛА из POT", !map2.has(delKey), `uid ${cmt(delEntry!, "uid: ")} исчез`);

const oldKey = key(target!);
const newKey = `${speakerCtx("Narrator")}\u0000${NEW_TEXT}`;
const newEntry = map2.get(newKey);
check("изменённая фраза: старый ключ выпал", !map2.has(oldKey));
check("изменённая фраза: появился НОВЫЙ uid", !!newEntry && cmt(newEntry, "uid: ") !== cmt(target!, "uid: "),
  `${cmt(target!, "uid: ")} -> ${newEntry ? cmt(newEntry, "uid: ") : "нет записи"}`);

const addedEntry = map2.get(`${speakerCtx("Narrator")}\u0000${NEW_LINE}`);
check("новая фраза получила свой uid", !!addedEntry && !!cmt(addedEntry, "uid: "));

console.log("\n=== Эмоции (джойн catalog/emotions.json по uid) ===");
const em0 = pot0Entries.filter((e) => cmt(e, "emotion: ")).length;
const em2 = pot2Entries.filter((e) => cmt(e, "emotion: ")).length;
check(
  "изменённая фраза ПОТЕРЯЛА тон (новый uid неизвестен каталогу — нужна ручная доразметка)",
  !!newEntry && !cmt(newEntry, "emotion: "),
);
check("новая фраза — без тона (нет в каталоге)", !!addedEntry && !cmt(addedEntry, "emotion: "));
let survived = 0;
let survivedTotal = 0;
for (const [k, e] of map0) {
  const emo = cmt(e, "emotion: ");
  if (!emo) continue;
  const e2 = map2.get(k);
  if (!e2) continue;
  survivedTotal += 1;
  if (cmt(e2, "emotion: ") === emo) survived += 1;
}
check("неизменённые фразы ПЕРЕЖИЛИ тон", survived === survivedTotal, `${survived}/${survivedTotal}`);
console.log(`  счётчик: было ${em0} записей с #. emotion:, стало ${em2} (Δ = ${em2 - em0})`);

console.log("\n=== ru.po через po_update (merge с новым POT) ===");
const ruText = readFileSync(RU_PATH, "utf-8");
const { entries: merged, stats } = mergePoUpdate(ruText, pot2);
const ruByKey = new Map(parsePo(ruText).filter((e) => e.msgid).map((e) => [key(e), e]));

const mergedByKey = new Map(merged.map((e) => [key(e), e]));
const delMerged = mergedByKey.get(delKey);
const oldMerged = mergedByKey.get(oldKey);
const newMerged = mergedByKey.get(newKey);
const addedMerged = mergedByKey.get(`${speakerCtx("Narrator")}\u0000${NEW_LINE}`);
const delWasTranslated = !!ruByKey.get(delKey)?.msgstr;
const oldWasTranslated = !!ruByKey.get(oldKey)?.msgstr;

console.log(
  `  статистика: перенесено ${stats.carried} (ретаргет ${stats.retargeted}), legacy ${stats.legacyKept}, ` +
    `новых пустых ${stats.newEntries}, выпавших пустых ${stats.droppedEmpty}`,
);
check(
  "переводы нетронутых фраз перенесены в новый ru.po",
  stats.carried >= 69000,
  `carried=${stats.carried}`,
);
check(
  "удалённая реплика: перевод сохранён как legacy",
  delWasTranslated ? delMerged?.flags.includes("legacy") && !!delMerged.msgstr : !delMerged,
  delWasTranslated ? `msgstr="${delMerged?.msgstr?.slice(0, 40)}..."` : "перевода не было — выкинута",
);
check(
  "изменённая фраза: СТАРЫЙ текст ушёл в legacy с переводом",
  oldWasTranslated ? oldMerged?.flags.includes("legacy") && !!oldMerged.msgstr : !oldMerged,
);
check("изменённая фраза: НОВЫЙ текст — пустой msgstr (ждёт перевода)", newMerged?.msgstr === "");
check("новая фраза — пустой msgstr", addedMerged?.msgstr === "");
let carriedExact = 0;
for (const [k, e] of mergedByKey) {
  if (e.flags.includes("legacy")) continue; // legacy — отдельная счётная группа
  const src = ruByKey.get(k);
  if (src?.msgstr && e.msgstr === src.msgstr) carriedExact += 1;
}
check("все прежние переводы перенесены байт-в-байт", carriedExact === stats.carried, `${carriedExact}/${stats.carried}`);

// ── 5. Сценарий «catalog удалён»: POT регенерируется БЕЗ джойна эмоций ───────
console.log("\n=== Контроль: апдейт без catalog/emotions.json (--no-emotions) ===");
const potNoEm = renderPot(scanGame(copyDir), new Date(0));
const noEmCount = potNoEm.split('\n#. emotion:').length - 1;
check("без каталога ВСЕ тон сгорают при регенерации", noEmCount === 0, `#. emotion: в POT = ${noEmCount} (было ${em2})`);
console.log(`  размер POT: с эмоциями ${pot2.length} б., без ${potNoEm.length} б.`);

console.log(`\n=== ИТОГ: ${failures === 0 ? "все проверки пройдены" : `ПРОВАЛЕНО проверок: ${failures}`} ===`);
process.exit(failures === 0 ? 0 : 1);
