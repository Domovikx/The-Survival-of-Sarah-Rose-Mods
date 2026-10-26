/**
 * Тесты potgen.mts — парсер Ren'Py, контексты, гарды, правила арок, рендер POT.
 * Запуск: node --test .opencode/skills/renpy-po/potgen.test.mts
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { parsePo } from "./po_core.mts";
import { arcOfLabel, loadEmotionsFromPot, renderPot, scanGame } from "./potgen.mts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const SCRIPT_RPY = `define s = Character("Sarah")
define k = Character("Kate")

label scene_one:
    s "Hello there!"
    "Captain" "Ahoy!"
    "The wind howls."
    k "Hello there!"
    s happy "Line with attribute."
    menu:
        "Take the sword":
            s "A fine choice."
        "Run away" if True:
            jump scene_one
    s "He said \\"Hi\\"."

image side happy:
    "suspicious.png" with dissolve

label after_image:
    s "Hello there!"
    s "After image block."
    "Auto-forwarded line" nointeract
    "Zoomed line" with dissolve
    s "{i}Italic[/i] with [name]"
    s ""
    # s "Skipped comment line"
    text "Keyword leak probe."
    imagebutton idle "gui/probe.png" action Start()
    return "Farewell text"

label OpeningScene:
    s "Shared cross-arc line."
label UnionKingdom1:
    s "Shared cross-arc line."
`;

const SCREENS_RPY = `screen main():
    vbox:
        text "Start Game"
        textbutton _("Continue") action Start()
    hbox:
        _("Save")

screen history_screen():
    label h.who:
        text "History leak probe."
`;

/** Сортируется ПЕРЕД script.rpy (define s/k живут там) — регресс двухпроходности. */
const AAA_RPY = `label gallery_intro:
    s "Gallery line before define."
    k "Kate gallery line."
`;

/**
 * Временное дерево game/ с фикстурами. Один общий каталог в repo tmp/
 * (правило: только локальный tmp репозитория, не AppData/Temp), пересоздаётся
 * при первом обращении в процессе.
 */
let fixtureDir: string | undefined;
function makeFixtureGame(): string {
  if (fixtureDir) return fixtureDir;
  const dir = join(REPO_ROOT, "tmp", "po-fixture");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "aaa_first.rpy"), AAA_RPY, "utf-8");
  writeFileSync(join(dir, "script.rpy"), SCRIPT_RPY, "utf-8");
  writeFileSync(join(dir, "screens.rpy"), SCREENS_RPY, "utf-8");
  // Галерейные файлы: их лейблы сканируются, но арки не несут (NO_ARC_FILES).
  writeFileSync(join(dir, "art.rpy"), 'label gallery:\n    s "Gallery arc line."\n', "utf-8");
  writeFileSync(join(dir, "replay_gallery.rpy"), 'label replay_mage_intro:\n    "Replay arc line."\n', "utf-8");
  mkdirSync(join(dir, "tl"));
  writeFileSync(join(dir, "tl", "junk.rpy"), '"Must not be scanned"\n', "utf-8");
  mkdirSync(join(dir, ".hidden"));
  writeFileSync(join(dir, ".hidden", "junk.rpy"), '"Must not be scanned either"\n', "utf-8");
  fixtureDir = dir;
  return dir;
}

function entriesByKey(gameDir: string): Map<string, { msgid: string; msgctxt: string; n: number }> {
  const catalog = scanGame(gameDir);
  return new Map([...catalog.entries.values()].map((e) => [`${e.msgctxt}\u0000${e.msgid}`, e]));
}

test("define-идентификатор резолвится в Display Name (speaker:Sarah)", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("speaker:Sarah\u0000Hello there!"));
  assert.ok(by.has("speaker:Sarah\u0000A fine choice."));
});

test("двухпроходный сбор: define резолвится и в файлах ДО источника define", () => {
  const by = entriesByKey(makeFixtureGame());
  // aaa_first.rpy сортируется раньше script.rpy (define s/k) — раньше эти
  // реплики утекали в спикеров-идентификаторов (как «s»/«al» в реальной игре).
  assert.ok(by.has("speaker:Sarah\u0000Gallery line before define."));
  assert.ok(by.has("speaker:Kate\u0000Kate gallery line."));
  assert.ok(![...by.values()].some((e) => e.msgctxt === "speaker:s"), "нет спикера «s»");
  assert.ok(![...by.values()].some((e) => e.msgctxt === "speaker:k"), "нет спикера «k»");
});

test("строковый спикер даёт speaker:Captain и запись speaker-name", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("speaker:Captain\u0000Ahoy!"));
  assert.ok(by.has("speaker-name\u0000Captain"));
  assert.ok(by.has("speaker-name\u0000Sarah"));
});

test("нарратор — speaker:Narrator: для озвучки это голос (casts/Narrator)", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("speaker:Narrator\u0000The wind howls."));
  assert.ok(![...by.values()].some((e) => e.msgctxt === "narration"), "старого контекста narration нет");
});

test("скриптовый label только на нулевом отступе (screen label h.who не включает парсер)", () => {
  const by = entriesByKey(makeFixtureGame());
  // screens.rpy: label h.who: в History-экране раньше включал sawLabel, и
  // text "▸" утекал как спикер text (бага реальной игры, screens.rpy:1002).
  assert.ok(![...by.values()].some((e) => e.msgid === "History leak probe."));
  assert.ok(![...by.values()].some((e) => e.msgctxt === "speaker:text"), "нет спикера «text»");
});

test("statement-ключи не бывают спикерами (text/imagebutton внутри label)", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(![...by.values()].some((e) => e.msgid === "Keyword leak probe."));
  assert.ok(![...by.values()].some((e) => e.msgid.includes(".png")), "ассеты не утекают");
});

test("say с атрибутами (s happy) резолвится через define", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("speaker:Sarah\u0000Line with attribute."));
});

test("пункты меню (в т.ч. с if-условием) и эхо-реплика внутри опции", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("menu\u0000Take the sword"));
  assert.ok(by.has("menu\u0000Run away"));
  // Эхо-реплика внутри блока выбора — отдельная запись диалога.
  assert.ok(by.has("speaker:Sarah\u0000A fine choice."));
});

test("тело image/ATL-блока не парсится (ассеты не становятся строками)", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(![...by.values()].some((e) => e.msgid.includes("suspicious.png")));
});

test("screen-строки снаружи label не парсятся; _() уходит в ui", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(![...by.values()].some((e) => e.msgid === "Start Game"));
  assert.ok(by.has("ui\u0000Continue"));
  assert.ok(by.has("ui\u0000Save"));
});

test("дедуп: повтор того же текста у того же спикера схлопывается, разные спикеры — нет", () => {
  const catalog = scanGame(makeFixtureGame());
  const hello = [...catalog.entries.values()].filter((e) => e.msgid === "Hello there!");
  assert.equal(hello.length, 2, "Sarah и Kate — две записи");
  const sarahHello = catalog.entries.get(`speaker:Sarah\u0000Hello there!`);
  // Sarah говорит фразу дважды (scene_one + after_image) — схлопнуто в одну
  // запись с n=2; Kate — отдельная запись.
  assert.equal(sarahHello?.n, 2);
  assert.ok(catalog.stats.mergedDupes >= 1, "эхо-дубль реплики в игре схлопнут");
});

test("экранированные кавычки доходят до msgid и рендерятся обратно", () => {
  const gameDir = makeFixtureGame();
  const by = entriesByKey(gameDir);
  assert.ok(by.has('speaker:Sarah\u0000He said "Hi".'));
  const pot = renderPot(scanGame(gameDir), new Date(0));
  assert.ok(pot.includes('msgid "He said \\"Hi\\"."'));
});

test("рендер детерминирован и отсортирован по (msgid, msgctxt)", () => {
  const gameDir = makeFixtureGame();
  const a = renderPot(scanGame(gameDir), new Date(0));
  const b = renderPot(scanGame(gameDir), new Date(0));
  assert.equal(a, b);
  const entries = parsePo(a).filter((e) => e.msgid);
  const keys = entries.map((e) => [e.msgid, e.msgctxt] as const);
  const sorted = [...keys].sort(
    (x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0) || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0),
  );
  assert.deepEqual(keys, sorted);
});

test("POT рендерится и парсится обратно без потерь", () => {
  const catalog = scanGame(makeFixtureGame());
  const parsed = parsePo(renderPot(catalog, new Date(0))).filter((e) => e.msgid);
  assert.equal(parsed.length, catalog.entries.size);
  const ctxs = new Set(parsed.map((e) => e.msgctxt));
  for (const want of ["speaker:Sarah", "speaker:Captain", "speaker:Narrator", "menu", "ui", "speaker-name"]) {
    assert.ok(ctxs.has(want), `контекст ${want} присутствует`);
  }
  for (const e of parsed) assert.equal(e.msgstr, "");
});

test("collectRpyFiles обходит tl/ и скрытые каталоги", () => {
  const files = readdirSync(makeFixtureGame());
  assert.ok(files.includes("script.rpy"));
  const catalog = scanGame(makeFixtureGame());
  assert.equal(catalog.stats.files, 5, "только *.rpy в корне (tl/ и скрытые — мимо)");
});

test("нарратор с суффиксами nointeract / with dissolve парсится", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("speaker:Narrator\u0000Auto-forwarded line"));
  assert.ok(by.has("speaker:Narrator\u0000Zoomed line"));
});

test("интерполяция и разметка Ren'Py доходят до msgid как есть", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("speaker:Sarah\u0000{i}Italic[/i] with [name]"));
});

test("комментарии и пустые реплики не попадают в шаблон", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(![...by.values()].some((e) => e.msgid.includes("Skipped comment")));
  assert.ok(![...by.values()].some((e) => e.msgid === ""));
});

test('пин: `return "text"` трактуется как спикер «return» (в игре не встречается)', () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("speaker:return\u0000Farewell text"));
});

test("uid = md5(msgid) у каждой записи и рендерится в #. uid:", () => {
  const catalog = scanGame(makeFixtureGame());
  const md5 = (t: string): string => createHash("md5").update(t, "utf8").digest("hex");
  const hello = catalog.entries.get("speaker:Sarah\u0000Hello there!");
  assert.equal(hello?.uid, md5("Hello there!"));

  const pot = renderPot(catalog, new Date(0));
  assert.ok(pot.includes(`#. uid: ${md5("Hello there!")}`));
  // Каждая запись POT несёт ровно один uid-комментарий (round-trip через parsePo).
  const parsed = parsePo(pot).filter((e) => e.msgid);
  for (const e of parsed) {
    const uids = e.comments.filter((c) => c.startsWith("uid: "));
    assert.equal(uids.length, 1, `один uid-комментарий у «${e.msgid.slice(0, 30)}»`);
    assert.match(uids[0], /^uid: [0-9a-f]{32}$/);
    assert.equal(uids[0].slice(5), md5(e.msgid), "uid в комментарии совпадает с md5(msgid)");
  }
});

test("emotion комментируется только для speaker:* (меню и ui — без)", () => {
  const gameDir = makeFixtureGame();
  const md5 = (t: string): string => createHash("md5").update(t, "utf8").digest("hex");
  const emotions = {
    [md5("Hello there!")]: "In a warm, affectionate tone",
    [md5("The wind howls.")]: "Ominously",
    [md5("Take the sword")]: "menu must not get emotion",
    [md5("Continue")]: "ui must not get emotion",
  };
  const catalog = scanGame(gameDir, { emotions });
  assert.equal(
    catalog.entries.get("speaker:Sarah\u0000Hello there!")?.emotion,
    "In a warm, affectionate tone",
    "эмоция реплики спикера",
  );
  assert.equal(
    catalog.entries.get("speaker:Narrator\u0000The wind howls.")?.emotion,
    "Ominously",
    "эмоция нарратора (он теперь спикер)",
  );
  assert.equal(catalog.entries.get("menu\u0000Take the sword")?.emotion, undefined, "меню без эмоции");
  assert.equal(catalog.entries.get("ui\u0000Continue")?.emotion, undefined, "ui без эмоции");

  const pot = renderPot(catalog, new Date(0));
  assert.ok(pot.includes("#. emotion: In a warm, affectionate tone"));
  assert.ok(pot.includes("#. emotion: Ominously"));
  assert.ok(!pot.includes("menu must not get emotion"));
  assert.ok(!pot.includes("ui must not get emotion"));
});

test("миграция emotion_new: два слоя тона не мешают друг другу (2026-10-26)", () => {
  // Решение владельца: новый тон пишется РЯДОМ со старым (`#. emotion_new:`),
  // у уже сгенерированного звука остаётся его тональность — плавный переход.
  const NUL = String.fromCharCode(0); // ключи entries: msgctxt NUL msgid
  const gameDir = makeFixtureGame();
  const md5 = (t: string): string => createHash("md5").update(t, "utf8").digest("hex");
  const uidHello = md5("Hello there!");
  const uidWind = md5("The wind howls.");
  const catalog = scanGame(gameDir, {
    emotions: { [uidHello]: "Old warm tone", [uidWind]: "Old narr tone" },
    emotionsNew: { [uidHello]: "New bright tone" },
  });

  const s = catalog.entries.get(`speaker:Sarah${NUL}Hello there!`);
  assert.equal(s?.emotion, "Old warm tone", "старый слой НЕ перетёрт");
  assert.equal(s?.emotionNew, "New bright tone", "новый слой лежит рядом");
  const w = catalog.entries.get(`speaker:Narrator${NUL}The wind howls.`);
  assert.equal(w?.emotion, "Old narr tone");
  assert.equal(w?.emotionNew, undefined, "без нового слоя — undefined");

  const pot = renderPot(catalog, new Date(0));
  assert.ok(pot.includes("#. emotion: Old warm tone"), "старый комментарий выводится");
  assert.ok(pot.includes("#. emotion_new: New bright tone"), "новый комментарий выводится");
  assert.ok(!pot.includes("#. emotion_new: Old narr tone"), "новый слой не засоряется старым");

  // roundtrip: оба слоя читаются обратно и НЕ путаются (prefix-разделение)
  assert.equal(loadEmotionsFromPot(pot)[uidHello], "Old warm tone");
  assert.deepEqual(loadEmotionsFromPot(pot, "emotion_new:"), { [uidHello]: "New bright tone" });
  assert.equal(loadEmotionsFromPot(pot, "emotion_new:")[uidWind], undefined);
});

test("без opts эмоции не проставляются; arc — всегда (правила встроены)", () => {
  const pot = renderPot(scanGame(makeFixtureGame()), new Date(0));
  assert.ok(!pot.includes("#. emotion:"));
  assert.ok(pot.includes("#. uid:"), "uid пишется всегда");
  assert.ok(pot.includes("#. arc:"), "арка ставится без opts — правила в самом potgen");
});

test("arcOfLabel: правила из имён лейблов (префикс, точное имя, фолбэк)", () => {
  // Префиксные семьи.
  assert.equal(arcOfLabel("OpeningSceneFirstMorning"), "Prologue");
  assert.equal(arcOfLabel("UnionKingdom9intermezzo1"), "UnionKingdom");
  assert.equal(arcOfLabel("TheBlackMonolithMage5"), "BlackMonolith");
  // Точные лейблы без общего префикса.
  assert.equal(arcOfLabel("CoronationDay"), "StoryBeginnings");
  assert.equal(arcOfLabel("WarCouncil"), "WarArc");
  // Регистр-чувствителен (case-sensitive): DemonArc1-3 — арка;
  // Demonarc4/5 — вне семьи → Other (паритет прежнего label_arc.json).
  assert.equal(arcOfLabel("DemonArc2"), "DemonArc");
  assert.equal(arcOfLabel("Demonarc4"), "Other");
  // Семейные имена, в чужом контексте, — не чужая арка (не-семейные).
  assert.equal(arcOfLabel("MarionOrVargaPath"), "Other");
  assert.equal(arcOfLabel("NeitherPath4"), "Other");
  // Фолбэк: любые неизвестные сюжетные лейблы (новизна игры) → Other.
  assert.equal(arcOfLabel("BrandNewLabelFromUpdate"), "Other");
  // Не-сюжет: splashscreen без арки (галерейные — на уровне файла, ниже).
  assert.equal(arcOfLabel("splashscreen"), undefined);
  // Документированные фиксы артефактов текст-резолва прежнего label_arc.json.
  assert.equal(arcOfLabel("VargaPath5"), "VargaMarionPath", "был Prologue — артефакт резолва");
  assert.equal(arcOfLabel("TrainingPathKate3"), "Training", "был Other — семья TrainingPath*");
});

test("arc/scene записей: внутри label по правилам, снаружи — без якорей; галереи исключены", () => {
  const catalog = scanGame(makeFixtureGame());
  const e = (key: string): { arc?: string; scene?: string } | undefined => catalog.entries.get(key);
  // Фикстурные сюжетные лейблы правилам неизвестны → фолбэк Other.
  assert.equal(e("speaker:Sarah\u0000Hello there!")?.arc, "Other");
  assert.equal(e("speaker:Narrator\u0000The wind howls.")?.arc, "Other");
  assert.equal(e("menu\u0000Take the sword")?.arc, "Other", "меню внутри label несёт арку");
  // Сцена — сам label (тоньше арки).
  assert.equal(e("speaker:Sarah\u0000Hello there!")?.scene, "scene_one");
  assert.equal(e("menu\u0000Take the sword")?.scene, "scene_one");
  // Дедуп (первый label-владелец побеждает): фраза в OpeningScene (Prologue)
  // и UnionKingdom1 (UnionKingdom) — якоря первой встречи, не второй.
  assert.equal(e("speaker:Sarah\u0000Shared cross-arc line.")?.arc, "Prologue");
  assert.equal(e("speaker:Sarah\u0000Shared cross-arc line.")?.scene, "OpeningScene");
  // Снаружи label: define-имена и ui-строки — без арки и сцены.
  assert.equal(e("speaker-name\u0000Sarah")?.arc, undefined);
  assert.equal(e("speaker-name\u0000Sarah")?.scene, undefined);
  assert.equal(e("ui\u0000Continue")?.arc, undefined);
  assert.equal(e("ui\u0000Continue")?.scene, undefined);
  // Галерейные файлы (art.rpy, replay_gallery.rpy): лейблы сканируются,
  // но их строки — без якорей.
  assert.equal(e("speaker:Sarah\u0000Gallery arc line.")?.arc, undefined);
  assert.equal(e("speaker:Sarah\u0000Gallery arc line.")?.scene, undefined);
  assert.equal(e("speaker:Narrator\u0000Replay arc line.")?.arc, undefined);
  assert.equal(e("speaker:Narrator\u0000Replay arc line.")?.scene, undefined);

  // Рендер: #. arc:/#. scene: доходят до POT-текста, у не-сюжетных — нет.
  const pot = renderPot(catalog, new Date(0));
  assert.ok(pot.includes("#. arc: Prologue"));
  assert.ok(pot.includes("#. scene: OpeningScene"));
  const parsed = parsePo(pot).filter((x) => x.msgid);
  const byId = new Map(parsed.map((x) => [`${x.msgctxt}\u0000${x.msgid}`, x.comments]));
  const shared = byId.get("speaker:Sarah\u0000Shared cross-arc line.") ?? [];
  assert.ok(shared.some((c) => c === "arc: Prologue"));
  assert.ok(shared.some((c) => c === "scene: OpeningScene"));
  const uiComments = byId.get("ui\u0000Continue") ?? [];
  assert.ok(!uiComments.some((c) => c.startsWith("arc: ") || c.startsWith("scene: ")), "ui-запись без якорей");
});
