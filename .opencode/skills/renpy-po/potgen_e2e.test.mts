/**
 * E2E: potgen против реальной установки TSSR (Steam, read-only).
 *
 * Прогоняется везде, где игра установлена (или задан TSSR_GAME); без
 * установки тесты скипаются. Гард актуальности: закоммиченный
 * po/template.pot обязан совпадать по объёму со свежим сканом — после
 * апдейта игры тест падает со словами «запусти npm run potgen».
 * Запуск: node --test .opencode/skills/renpy-po/potgen_e2e.test.mts
 */

import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { parsePo, renderPo } from "./po_core.mts";
import {
  loadEmotionsFromPot,
  parseLabelMap,
  renderPot,
  renderSpeakersMts,
  scanGame,
  speakerCtx,
  speakersMtsPath,
} from "./potgen.mts";
import { mergePoUpdate } from "./po_update.mts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const GAME = process.env.TSSR_GAME ?? "C:/Program Files (x86)/Steam/steamapps/common/The Survival of Sarah Rose/game";
const POT_PATH = join(REPO_ROOT, "patches", "ai-voice-pack", "po", "template.pot");
const SPEAKERS_MTS_PATH = speakersMtsPath(POT_PATH);
const HAVE_GAME = existsSync(join(GAME, "script.rpy"));

/** Тон для генерации метаданных — roundtrip самого шаблона (emotions.json удалён). */
function loadEmotions(): Record<string, string> | undefined {
  if (!existsSync(POT_PATH)) return undefined;
  return loadEmotionsFromPot(readFileSync(POT_PATH, "utf-8"));
}

/** Дата из заголовка POT: "POT-Creation-Date: YYYY-MM-DD HH:MM+0000\n". */
function potCreationDate(text: string): Date {
  const m = /"POT-Creation-Date: (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})\+0000\\n"/.exec(text);
  return m ? new Date(`${m[1]}T${m[2]}:00.000Z`) : new Date(0);
}

test(
  "e2e: реальная игра разбирается с ожидаемыми объёмами по контекстам",
  { skip: !HAVE_GAME && "нет установки игры (TSSR_GAME)" },
  () => {
    const catalog = scanGame(GAME);
    const s = catalog.stats;
    assert.ok(s.files >= 5, `найдено .rpy файлов: ${s.files}`);
    assert.ok(s.byContext.dialogue > 20000, `dialogue: ${s.byContext.dialogue}`);
    assert.ok(s.byContext.narration > 40000, `narration: ${s.byContext.narration}`);
    assert.ok(s.byContext.menu > 400, `menu: ${s.byContext.menu}`);
    assert.ok(s.byContext["speaker-name"] >= 150, `speaker-name: ${s.byContext["speaker-name"]}`);
    assert.ok(s.byContext.ui > 50, `ui: ${s.byContext.ui}`);
  },
);

test(
  "e2e: якоря — имена из define и строковый спикер Voice",
  { skip: !HAVE_GAME && "нет установки игры (TSSR_GAME)" },
  () => {
    const catalog = scanGame(GAME);
    // Имена персонажей из define (script.rpy define-блок).
    assert.ok(catalog.entries.has("speaker-name\u0000Sarah"), "speaker-name Sarah");
    assert.ok(catalog.entries.has("speaker-name\u0000Razaphel"), "speaker-name Razaphel");
    // Строковый спикер: script.rpy:89171 «"Voice" "Go to the ships!"».
    assert.ok(catalog.entries.has(`${speakerCtx("Voice")}\u0000Go to the ships!`), "speaker:Voice — Go to the ships!");
  },
);

test(
  "e2e: каждая озвучиваемая запись (speaker:*) несёт арку — голосуемо = привязано",
  { skip: (!HAVE_GAME || !existsSync(POT_PATH)) && "нет игры или шаблона" },
  () => {
    // Инвариант мапы озвучки: генератор раскладывает аудио по папкам арок,
    // поэтому у голосуемой записи арка обязательна. Запись без арки —
    // структурная дыра (новый файл/лейбл после апдейта игры): фейл с именем
    // виновника, а не молчаливый пропуск генерации.
    const catalog = scanGame(GAME);
    const orphan = [...catalog.entries.values()].find((e) => e.msgctxt.startsWith("speaker:") && !e.arc);
    if (orphan) {
      assert.fail(
        `озвучиваемая запись без арки: «${orphan.msgid.slice(0, 70)}» (${orphan.msgctxt}) — ` +
          `новый файл/лейбл вне правил? допиши ARC-правила или NO_ARC_FILES в potgen.mts`,
      );
    }
    // ui/имена/меню — не озвучиваются, их арка не требуется.
  },
);

test(
  "e2e: закоммиченный template.pot байт-в-байт совпадает со свежей генерацией (иначе — npm run potgen)",
  { skip: (!HAVE_GAME || !existsSync(POT_PATH)) && "нет игры или шаблона" },
  () => {
    const committed = readFileSync(POT_PATH, "utf-8");
    const fresh = renderPot(scanGame(GAME, { emotions: loadEmotions() }), potCreationDate(committed));
    if (fresh !== committed) {
      let i = 0;
      const n = Math.min(fresh.length, committed.length);
      while (i < n && fresh[i] === committed[i]) i++;
      const ctx = (s: string): string => JSON.stringify(s.slice(Math.max(0, i - 60), i + 60));
      assert.fail(
        `po/template.pot устарел: расхождение на позиции ${i} ` +
          `(свежая генерация ${fresh.length} б., закоммиченная ${committed.length} б). ` +
          `Свежая: ...${ctx(fresh)}... vs закоммиченная: ...${ctx(committed)}... ` +
          `— запусти npm run potgen и закоммить`,
      );
    }
  },
);

test(
  "e2e: label-map инвентарь — полный (сцены-дублёры не потеряны), фиксы артефактов на месте",
  { skip: (!HAVE_GAME || !existsSync(POT_PATH)) && "нет игры или шаблона" },
  () => {
    const map = parseLabelMap(readFileSync(POT_PATH, "utf-8"));
    const n = Object.keys(map).length;
    assert.ok(
      n >= 240,
      `label-map: ${n} лейблов (ожидается ~264: scene-комментариев только 241 — дедуп схлопывает сцены)`,
    );
    // Семьи по префиксам/точным именам.
    const open = Object.keys(map).filter((l) => l.startsWith("OpeningScene"));
    assert.ok(open.length > 0, "лейблы OpeningScene* есть");
    for (const l of open) assert.equal(map[l], "Prologue", l);
    // Документированные фиксы артефактов прежнего label_arc.json (3 шт.):
    assert.equal(map["VargaPath5"], "VargaMarionPath", "был Prologue — артефакт текст-резолва");
    assert.equal(map["TrainingPathKate3"], "Training", "был Other — семья TrainingPath*");
    assert.equal(map["prostitutealaric1"], "Other", "лейбл не досчитан прежним тл-сканом — добавлен");
    // Регистр-чувствительность: Demonarc4/5 вне семьи DemonArc*.
    assert.equal(map["Demonarc4"], "Other");
    // Сцены-дублёры (все строки которых схлопнуты дедупом) обязаны быть в инвентаре.
    for (const l of ["MercenaryQueen1", "Sakar1", "MythranInvasion1"]) {
      assert.ok(map[l], `${l} — сцена без уникальных строк должна быть в label-map`);
    }
  },
);

test(
  "e2e: закоммиченный template.speakers.mts байт-в-байт совпадает со свежей генерацией (иначе — npm run potgen)",
  { skip: (!HAVE_GAME || !existsSync(SPEAKERS_MTS_PATH)) && "нет игры или файла спикеров" },
  () => {
    const committed = readFileSync(SPEAKERS_MTS_PATH, "utf-8");
    const fresh = renderSpeakersMts(scanGame(GAME));
    assert.equal(
      fresh,
      committed,
      "po/template.speakers.mts устарел относительно игры — запусти npm run potgen и закоммить",
    );
  },
);

test(
  "e2e: render -> parse round-trip на всём реальном каталоге",
  { skip: !HAVE_GAME && "нет установки игры (TSSR_GAME)" },
  () => {
    const catalog = scanGame(GAME);
    const parsed = parsePo(renderPot(catalog, new Date(0))).filter((e) => e.msgid);
    assert.equal(parsed.length, catalog.entries.size);
  },
);

test(
  "e2e: симуляция новой версии игры — POT регенерируется, переводы переживают через po_update",
  { skip: !HAVE_GAME && "нет установки игры (TSSR_GAME)" },
  () => {
    // 1. Копия .rpy в repo tmp (правило: только локальный tmp репозитория).
    const simRoot = join(REPO_ROOT, "tmp", "e2e-newver");
    const copyDir = join(simRoot, "game");
    rmSync(simRoot, { recursive: true, force: true });
    mkdirSync(copyDir, { recursive: true });
    for (const f of readdirSync(GAME)) {
      if (f.endsWith(".rpy")) copyFileSync(join(GAME, f), join(copyDir, f));
    }
    const emotions = loadEmotions();
    const stripDate = (t: string): string => t.replace(/"POT-Creation-Date:[^"]*"/, "");

    // 2. Детерминизм: копия даёт POT, байт-в-байт равный закоммиченному.
    assert.equal(
      stripDate(renderPot(scanGame(copyDir, { emotions }), new Date(0))),
      stripDate(readFileSync(POT_PATH, "utf-8")),
    );

    // 3. «Апдейт игры» в копии: удаление известной реплики, переименование
    //    нарраторской строки, добавление новой.
    const sp = join(copyDir, "script.rpy");
    let src = readFileSync(sp, "utf-8");
    assert.ok(src.includes('"Voice" "Go to the ships!"'), "якорь удаления на месте");
    src = src.replace(/^"Voice" "Go to the ships!"\r?\n/m, "");
    const pot1 = parsePo(readFileSync(POT_PATH, "utf-8")).filter((e) => e.msgid);
    const narr = pot1.find(
      (e) =>
        e.msgctxt === speakerCtx("Narrator") &&
        e.msgid.length > 40 &&
        !/[\\[\]{}]/.test(e.msgid) &&
        src.split(`"${e.msgid}"`).length === 2,
    );
    assert.ok(narr, "находится уникальная нарраторская строка для переименования");
    src = src.replace(`"${narr.msgid}"`, `"${narr.msgid} (v2)"`);
    src = src.replace(/^(label [^\n]*:\r?\n)/m, '$1    "A brand new narration line."\n');
    writeFileSync(sp, src, "utf-8");

    // 4. Регенерация POT из «обновлённой» игры.
    const pot2 = renderPot(scanGame(copyDir, { emotions }), new Date(0));
    assert.ok(!pot2.includes('msgid "Go to the ships!"'), "удалённая реплика выпала из POT");
    assert.ok(pot2.includes(`msgid "${narr.msgid} (v2)"`), "переименованная реплика в POT v2");
    assert.ok(pot2.includes('msgid "A brand new narration line."'), "новая реплика в POT v2");

    // 5. po_update: синтетический po (перевод удалённой реплики + нетронутого
    //    меню) → merge с pot2: удалённая ушла в legacy с переводом, меню перенесено.
    const menu1 = pot1.find((e) => e.msgctxt === "menu" && e.msgid.length > 5);
    assert.ok(menu1, "якорь меню есть");
    const ship = pot1.find((e) => e.msgctxt === speakerCtx("Voice") && e.msgid === "Go to the ships!");
    assert.ok(ship, "якорь Voice есть");
    const synthEntries = [ship, menu1].map((e) => ({
      ...e,
      msgstr: e.msgid === "Go to the ships!" ? "На корабли!" : "Перевод пункта меню.",
    }));
    const { entries: merged, stats } = mergePoUpdate(renderPo(synthEntries, ["# e2e synth po"]), pot2);
    assert.equal(stats.legacyKept, 1, "удалённая реплика оставлена как legacy с переводом");
    const legacyE = merged.find((e) => e.msgid === "Go to the ships!");
    assert.ok(legacyE?.flags.includes("legacy"), "флаг legacy проставлен");
    assert.equal(legacyE?.msgstr, "На корабли!", "human-перевод сохранён");
    const menuE = merged.find((e) => e.msgctxt === "menu" && e.msgid === menu1.msgid);
    assert.equal(menuE?.msgstr, "Перевод пункта меню.", "нетронутый перевод перенесён");
  },
);
