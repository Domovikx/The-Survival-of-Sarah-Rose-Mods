/**
 * Тесты potgen.mts — парсер Ren'Py, контексты, гарды, рендер POT.
 * Запуск: node --test .opencode/skills/renpy-po/potgen.test.mts
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parsePo } from "./po_core.mts";
import { collectRpyFiles, renderPot, scanGame } from "./potgen.mts";

const SCRIPT_RPY = `define s = Character("Sarah")
define k = Character("Kate")

label scene_one:
    s "Hello there!"
    "Captain" "Ahoy!"
    "The wind howls."
    k "Hello there!"
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
`;

const SCREENS_RPY = `screen main():
    vbox:
        text "Start Game"
        textbutton _("Continue") action Start()
    hbox:
        _("Save")
`;

/** Временное дерево game/ с фикстурами скриптов. */
function makeFixtureGame(): string {
  const dir = mkdtempSync(join(tmpdir(), "tssr-po-"));
  writeFileSync(join(dir, "script.rpy"), SCRIPT_RPY, "utf-8");
  writeFileSync(join(dir, "screens.rpy"), SCREENS_RPY, "utf-8");
  mkdirSync(join(dir, "tl"));
  writeFileSync(join(dir, "tl", "junk.rpy"), '"Must not be scanned"\n', "utf-8");
  mkdirSync(join(dir, ".hidden"));
  writeFileSync(join(dir, ".hidden", "junk.rpy"), '"Must not be scanned either"\n', "utf-8");
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

test("строковый спикер даёт speaker:Captain и запись speaker-name", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("speaker:Captain\u0000Ahoy!"));
  assert.ok(by.has("speaker-name\u0000Captain"));
  assert.ok(by.has("speaker-name\u0000Sarah"));
});

test("нарраторские строки попадают в narration", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("narration\u0000The wind howls."));
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
  for (const want of ["speaker:Sarah", "speaker:Captain", "narration", "menu", "ui", "speaker-name"]) {
    assert.ok(ctxs.has(want), `контекст ${want} присутствует`);
  }
  for (const e of parsed) assert.equal(e.msgstr, "");
});

test("collectRpyFiles обходит tl/ и скрытые каталоги", () => {
  const files = readdirSync(makeFixtureGame());
  assert.ok(files.includes("script.rpy"));
  const catalog = scanGame(makeFixtureGame());
  assert.equal(catalog.stats.files, 2, "только script.rpy и screens.rpy");
});
