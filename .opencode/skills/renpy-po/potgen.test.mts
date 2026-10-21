/**
 * Тесты potgen.mts — парсер Ren'Py, контексты, гарды, рендер POT.
 * Запуск: node --test .opencode/skills/renpy-po/potgen.test.mts
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { parsePo } from "./po_core.mts";
import { renderPot, scanGame } from "./potgen.mts";

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
  assert.equal(catalog.stats.files, 3, "только aaa_first.rpy, script.rpy и screens.rpy");
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

test("без opts эмоции не проставляются (POT без #. emotion:)", () => {
  const pot = renderPot(scanGame(makeFixtureGame()), new Date(0));
  assert.ok(!pot.includes("#. emotion:"));
  assert.ok(pot.includes("#. uid:"), "uid пишется всегда");
});
