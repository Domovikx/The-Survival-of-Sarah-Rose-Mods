/**
 * Ð¢ÐµÑÑÑ potgen.mts â Ð¿Ð°ÑÑÐµÑ Ren'Py, ÐºÐ¾Ð½ÑÐµÐºÑÑÑ, Ð³Ð°ÑÐ´Ñ, Ð¿ÑÐ°Ð²Ð¸Ð»Ð° Ð°ÑÐ¾Ðº, ÑÐµÐ½Ð´ÐµÑ POT.
 * ÐÐ°Ð¿ÑÑÐº: node --test .opencode/skills/renpy-po/potgen.test.mts
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

/** Ð¡Ð¾ÑÑÐ¸ÑÑÐµÑÑÑ ÐÐÐ ÐÐ script.rpy (define s/k Ð¶Ð¸Ð²ÑÑ ÑÐ°Ð¼) â ÑÐµÐ³ÑÐµÑÑ Ð´Ð²ÑÑÐ¿ÑÐ¾ÑÐ¾Ð´Ð½Ð¾ÑÑÐ¸. */
const AAA_RPY = `label gallery_intro:
    s "Gallery line before define."
    k "Kate gallery line."
`;

/**
 * ÐÑÐµÐ¼ÐµÐ½Ð½Ð¾Ðµ Ð´ÐµÑÐµÐ²Ð¾ game/ Ñ ÑÐ¸ÐºÑÑÑÑÐ°Ð¼Ð¸. ÐÐ´Ð¸Ð½ Ð¾Ð±ÑÐ¸Ð¹ ÐºÐ°ÑÐ°Ð»Ð¾Ð³ Ð² repo tmp/
 * (Ð¿ÑÐ°Ð²Ð¸Ð»Ð¾: ÑÐ¾Ð»ÑÐºÐ¾ Ð»Ð¾ÐºÐ°Ð»ÑÐ½ÑÐ¹ tmp ÑÐµÐ¿Ð¾Ð·Ð¸ÑÐ¾ÑÐ¸Ñ, Ð½Ðµ AppData/Temp), Ð¿ÐµÑÐµÑÐ¾Ð·Ð´Ð°ÑÑÑÑ
 * Ð¿ÑÐ¸ Ð¿ÐµÑÐ²Ð¾Ð¼ Ð¾Ð±ÑÐ°ÑÐµÐ½Ð¸Ð¸ Ð² Ð¿ÑÐ¾ÑÐµÑÑÐµ.
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
  // ÐÐ°Ð»ÐµÑÐµÐ¹Ð½ÑÐµ ÑÐ°Ð¹Ð»Ñ: Ð¸Ñ Ð»ÐµÐ¹Ð±Ð»Ñ ÑÐºÐ°Ð½Ð¸ÑÑÑÑÑÑ, Ð½Ð¾ Ð°ÑÐºÐ¸ Ð½Ðµ Ð½ÐµÑÑÑ (NO_ARC_FILES).
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

test("define-Ð¸Ð´ÐµÐ½ÑÐ¸ÑÐ¸ÐºÐ°ÑÐ¾Ñ ÑÐµÐ·Ð¾Ð»Ð²Ð¸ÑÑÑ Ð² Display Name (speaker:Sarah)", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("speaker:Sarah\u0000Hello there!"));
  assert.ok(by.has("speaker:Sarah\u0000A fine choice."));
});

test("Ð´Ð²ÑÑÐ¿ÑÐ¾ÑÐ¾Ð´Ð½ÑÐ¹ ÑÐ±Ð¾Ñ: define ÑÐµÐ·Ð¾Ð»Ð²Ð¸ÑÑÑ Ð¸ Ð² ÑÐ°Ð¹Ð»Ð°Ñ ÐÐ Ð¸ÑÑÐ¾ÑÐ½Ð¸ÐºÐ° define", () => {
  const by = entriesByKey(makeFixtureGame());
  // aaa_first.rpy ÑÐ¾ÑÑÐ¸ÑÑÐµÑÑÑ ÑÐ°Ð½ÑÑÐµ script.rpy (define s/k) â ÑÐ°Ð½ÑÑÐµ ÑÑÐ¸
  // ÑÐµÐ¿Ð»Ð¸ÐºÐ¸ ÑÑÐµÐºÐ°Ð»Ð¸ Ð² ÑÐ¿Ð¸ÐºÐµÑÐ¾Ð²-Ð¸Ð´ÐµÐ½ÑÐ¸ÑÐ¸ÐºÐ°ÑÐ¾ÑÐ¾Ð² (ÐºÐ°Ðº Â«sÂ»/Â«alÂ» Ð² ÑÐµÐ°Ð»ÑÐ½Ð¾Ð¹ Ð¸Ð³ÑÐµ).
  assert.ok(by.has("speaker:Sarah\u0000Gallery line before define."));
  assert.ok(by.has("speaker:Kate\u0000Kate gallery line."));
  assert.ok(![...by.values()].some((e) => e.msgctxt === "speaker:s"), "Ð½ÐµÑ ÑÐ¿Ð¸ÐºÐµÑÐ° Â«sÂ»");
  assert.ok(![...by.values()].some((e) => e.msgctxt === "speaker:k"), "Ð½ÐµÑ ÑÐ¿Ð¸ÐºÐµÑÐ° Â«kÂ»");
});

test("ÑÑÑÐ¾ÐºÐ¾Ð²ÑÐ¹ ÑÐ¿Ð¸ÐºÐµÑ Ð´Ð°ÑÑ speaker:Captain Ð¸ Ð·Ð°Ð¿Ð¸ÑÑ speaker-name", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("speaker:Captain\u0000Ahoy!"));
  assert.ok(by.has("speaker-name\u0000Captain"));
  assert.ok(by.has("speaker-name\u0000Sarah"));
});

test("Ð½Ð°ÑÑÐ°ÑÐ¾Ñ â speaker:Narrator: Ð´Ð»Ñ Ð¾Ð·Ð²ÑÑÐºÐ¸ ÑÑÐ¾ Ð³Ð¾Ð»Ð¾Ñ (casts/Narrator)", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("speaker:Narrator\u0000The wind howls."));
  assert.ok(![...by.values()].some((e) => e.msgctxt === "narration"), "ÑÑÐ°ÑÐ¾Ð³Ð¾ ÐºÐ¾Ð½ÑÐµÐºÑÑÐ° narration Ð½ÐµÑ");
});

test("ÑÐºÑÐ¸Ð¿ÑÐ¾Ð²ÑÐ¹ label ÑÐ¾Ð»ÑÐºÐ¾ Ð½Ð° Ð½ÑÐ»ÐµÐ²Ð¾Ð¼ Ð¾ÑÑÑÑÐ¿Ðµ (screen label h.who Ð½Ðµ Ð²ÐºÐ»ÑÑÐ°ÐµÑ Ð¿Ð°ÑÑÐµÑ)", () => {
  const by = entriesByKey(makeFixtureGame());
  // screens.rpy: label h.who: Ð² History-ÑÐºÑÐ°Ð½Ðµ ÑÐ°Ð½ÑÑÐµ Ð²ÐºÐ»ÑÑÐ°Ð» sawLabel, Ð¸
  // text "â¸" ÑÑÐµÐºÐ°Ð» ÐºÐ°Ðº ÑÐ¿Ð¸ÐºÐµÑ text (Ð±Ð°Ð³Ð° ÑÐµÐ°Ð»ÑÐ½Ð¾Ð¹ Ð¸Ð³ÑÑ, screens.rpy:1002).
  assert.ok(![...by.values()].some((e) => e.msgid === "History leak probe."));
  assert.ok(![...by.values()].some((e) => e.msgctxt === "speaker:text"), "Ð½ÐµÑ ÑÐ¿Ð¸ÐºÐµÑÐ° Â«textÂ»");
});

test("statement-ÐºÐ»ÑÑÐ¸ Ð½Ðµ Ð±ÑÐ²Ð°ÑÑ ÑÐ¿Ð¸ÐºÐµÑÐ°Ð¼Ð¸ (text/imagebutton Ð²Ð½ÑÑÑÐ¸ label)", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(![...by.values()].some((e) => e.msgid === "Keyword leak probe."));
  assert.ok(![...by.values()].some((e) => e.msgid.includes(".png")), "Ð°ÑÑÐµÑÑ Ð½Ðµ ÑÑÐµÐºÐ°ÑÑ");
});

test("say Ñ Ð°ÑÑÐ¸Ð±ÑÑÐ°Ð¼Ð¸ (s happy) ÑÐµÐ·Ð¾Ð»Ð²Ð¸ÑÑÑ ÑÐµÑÐµÐ· define", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("speaker:Sarah\u0000Line with attribute."));
});

test("Ð¿ÑÐ½ÐºÑÑ Ð¼ÐµÐ½Ñ (Ð² Ñ.Ñ. Ñ if-ÑÑÐ»Ð¾Ð²Ð¸ÐµÐ¼) Ð¸ ÑÑÐ¾-ÑÐµÐ¿Ð»Ð¸ÐºÐ° Ð²Ð½ÑÑÑÐ¸ Ð¾Ð¿ÑÐ¸Ð¸", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("menu\u0000Take the sword"));
  assert.ok(by.has("menu\u0000Run away"));
  // Ð­ÑÐ¾-ÑÐµÐ¿Ð»Ð¸ÐºÐ° Ð²Ð½ÑÑÑÐ¸ Ð±Ð»Ð¾ÐºÐ° Ð²ÑÐ±Ð¾ÑÐ° â Ð¾ÑÐ´ÐµÐ»ÑÐ½Ð°Ñ Ð·Ð°Ð¿Ð¸ÑÑ Ð´Ð¸Ð°Ð»Ð¾Ð³Ð°.
  assert.ok(by.has("speaker:Sarah\u0000A fine choice."));
});

test("ÑÐµÐ»Ð¾ image/ATL-Ð±Ð»Ð¾ÐºÐ° Ð½Ðµ Ð¿Ð°ÑÑÐ¸ÑÑÑ (Ð°ÑÑÐµÑÑ Ð½Ðµ ÑÑÐ°Ð½Ð¾Ð²ÑÑÑÑ ÑÑÑÐ¾ÐºÐ°Ð¼Ð¸)", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(![...by.values()].some((e) => e.msgid.includes("suspicious.png")));
});

test("screen-ÑÑÑÐ¾ÐºÐ¸ ÑÐ½Ð°ÑÑÐ¶Ð¸ label Ð½Ðµ Ð¿Ð°ÑÑÑÑÑÑ; _() ÑÑÐ¾Ð´Ð¸Ñ Ð² ui", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(![...by.values()].some((e) => e.msgid === "Start Game"));
  assert.ok(by.has("ui\u0000Continue"));
  assert.ok(by.has("ui\u0000Save"));
});

test("Ð´ÐµÐ´ÑÐ¿: Ð¿Ð¾Ð²ÑÐ¾Ñ ÑÐ¾Ð³Ð¾ Ð¶Ðµ ÑÐµÐºÑÑÐ° Ñ ÑÐ¾Ð³Ð¾ Ð¶Ðµ ÑÐ¿Ð¸ÐºÐµÑÐ° ÑÑÐ»Ð¾Ð¿ÑÐ²Ð°ÐµÑÑÑ, ÑÐ°Ð·Ð½ÑÐµ ÑÐ¿Ð¸ÐºÐµÑÑ â Ð½ÐµÑ", () => {
  const catalog = scanGame(makeFixtureGame());
  const hello = [...catalog.entries.values()].filter((e) => e.msgid === "Hello there!");
  assert.equal(hello.length, 2, "Sarah Ð¸ Kate â Ð´Ð²Ðµ Ð·Ð°Ð¿Ð¸ÑÐ¸");
  const sarahHello = catalog.entries.get(`speaker:Sarah\u0000Hello there!`);
  // Sarah Ð³Ð¾Ð²Ð¾ÑÐ¸Ñ ÑÑÐ°Ð·Ñ Ð´Ð²Ð°Ð¶Ð´Ñ (scene_one + after_image) â ÑÑÐ»Ð¾Ð¿Ð½ÑÑÐ¾ Ð² Ð¾Ð´Ð½Ñ
  // Ð·Ð°Ð¿Ð¸ÑÑ Ñ n=2; Kate â Ð¾ÑÐ´ÐµÐ»ÑÐ½Ð°Ñ Ð·Ð°Ð¿Ð¸ÑÑ.
  assert.equal(sarahHello?.n, 2);
  assert.ok(catalog.stats.mergedDupes >= 1, "ÑÑÐ¾-Ð´ÑÐ±Ð»Ñ ÑÐµÐ¿Ð»Ð¸ÐºÐ¸ Ð² Ð¸Ð³ÑÐµ ÑÑÐ»Ð¾Ð¿Ð½ÑÑ");
});

test("ÑÐºÑÐ°Ð½Ð¸ÑÐ¾Ð²Ð°Ð½Ð½ÑÐµ ÐºÐ°Ð²ÑÑÐºÐ¸ Ð´Ð¾ÑÐ¾Ð´ÑÑ Ð´Ð¾ msgid Ð¸ ÑÐµÐ½Ð´ÐµÑÑÑÑÑ Ð¾Ð±ÑÐ°ÑÐ½Ð¾", () => {
  const gameDir = makeFixtureGame();
  const by = entriesByKey(gameDir);
  assert.ok(by.has('speaker:Sarah\u0000He said "Hi".'));
  const pot = renderPot(scanGame(gameDir), new Date(0));
  assert.ok(pot.includes('msgid "He said \\"Hi\\"."'));
});

test("ÑÐµÐ½Ð´ÐµÑ Ð´ÐµÑÐµÑÐ¼Ð¸Ð½Ð¸ÑÐ¾Ð²Ð°Ð½ Ð¸ Ð¾ÑÑÐ¾ÑÑÐ¸ÑÐ¾Ð²Ð°Ð½ Ð¿Ð¾ (msgid, msgctxt)", () => {
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

test("POT ÑÐµÐ½Ð´ÐµÑÐ¸ÑÑÑ Ð¸ Ð¿Ð°ÑÑÐ¸ÑÑÑ Ð¾Ð±ÑÐ°ÑÐ½Ð¾ Ð±ÐµÐ· Ð¿Ð¾ÑÐµÑÑ", () => {
  const catalog = scanGame(makeFixtureGame());
  const parsed = parsePo(renderPot(catalog, new Date(0))).filter((e) => e.msgid);
  assert.equal(parsed.length, catalog.entries.size);
  const ctxs = new Set(parsed.map((e) => e.msgctxt));
  for (const want of ["speaker:Sarah", "speaker:Captain", "speaker:Narrator", "menu", "ui", "speaker-name"]) {
    assert.ok(ctxs.has(want), `ÐºÐ¾Ð½ÑÐµÐºÑÑ ${want} Ð¿ÑÐ¸ÑÑÑÑÑÐ²ÑÐµÑ`);
  }
  for (const e of parsed) assert.equal(e.msgstr, "");
});

test("collectRpyFiles Ð¾Ð±ÑÐ¾Ð´Ð¸Ñ tl/ Ð¸ ÑÐºÑÑÑÑÐµ ÐºÐ°ÑÐ°Ð»Ð¾Ð³Ð¸", () => {
  const files = readdirSync(makeFixtureGame());
  assert.ok(files.includes("script.rpy"));
  const catalog = scanGame(makeFixtureGame());
  assert.equal(catalog.stats.files, 5, "ÑÐ¾Ð»ÑÐºÐ¾ *.rpy Ð² ÐºÐ¾ÑÐ½Ðµ (tl/ Ð¸ ÑÐºÑÑÑÑÐµ â Ð¼Ð¸Ð¼Ð¾)");
});

test("Ð½Ð°ÑÑÐ°ÑÐ¾Ñ Ñ ÑÑÑÑÐ¸ÐºÑÐ°Ð¼Ð¸ nointeract / with dissolve Ð¿Ð°ÑÑÐ¸ÑÑÑ", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("speaker:Narrator\u0000Auto-forwarded line"));
  assert.ok(by.has("speaker:Narrator\u0000Zoomed line"));
});

test("Ð¸Ð½ÑÐµÑÐ¿Ð¾Ð»ÑÑÐ¸Ñ Ð¸ ÑÐ°Ð·Ð¼ÐµÑÐºÐ° Ren'Py Ð´Ð¾ÑÐ¾Ð´ÑÑ Ð´Ð¾ msgid ÐºÐ°Ðº ÐµÑÑÑ", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("speaker:Sarah\u0000{i}Italic[/i] with [name]"));
});

test("ÐºÐ¾Ð¼Ð¼ÐµÐ½ÑÐ°ÑÐ¸Ð¸ Ð¸ Ð¿ÑÑÑÑÐµ ÑÐµÐ¿Ð»Ð¸ÐºÐ¸ Ð½Ðµ Ð¿Ð¾Ð¿Ð°Ð´Ð°ÑÑ Ð² ÑÐ°Ð±Ð»Ð¾Ð½", () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(![...by.values()].some((e) => e.msgid.includes("Skipped comment")));
  assert.ok(![...by.values()].some((e) => e.msgid === ""));
});

test('Ð¿Ð¸Ð½: `return "text"` ÑÑÐ°ÐºÑÑÐµÑÑÑ ÐºÐ°Ðº ÑÐ¿Ð¸ÐºÐµÑ Â«returnÂ» (Ð² Ð¸Ð³ÑÐµ Ð½Ðµ Ð²ÑÑÑÐµÑÐ°ÐµÑÑÑ)', () => {
  const by = entriesByKey(makeFixtureGame());
  assert.ok(by.has("speaker:return\u0000Farewell text"));
});

test("uid = md5(msgid) Ñ ÐºÐ°Ð¶Ð´Ð¾Ð¹ Ð·Ð°Ð¿Ð¸ÑÐ¸ Ð¸ ÑÐµÐ½Ð´ÐµÑÐ¸ÑÑÑ Ð² #. uid:", () => {
  const catalog = scanGame(makeFixtureGame());
  const md5 = (t: string): string => createHash("md5").update(t, "utf8").digest("hex");
  const hello = catalog.entries.get("speaker:Sarah\u0000Hello there!");
  assert.equal(hello?.uid, md5("Hello there!"));

  const pot = renderPot(catalog, new Date(0));
  assert.ok(pot.includes(`#. uid: ${md5("Hello there!")}`));
  // ÐÐ°Ð¶Ð´Ð°Ñ Ð·Ð°Ð¿Ð¸ÑÑ POT Ð½ÐµÑÑÑ ÑÐ¾Ð²Ð½Ð¾ Ð¾Ð´Ð¸Ð½ uid-ÐºÐ¾Ð¼Ð¼ÐµÐ½ÑÐ°ÑÐ¸Ð¹ (round-trip ÑÐµÑÐµÐ· parsePo).
  const parsed = parsePo(pot).filter((e) => e.msgid);
  for (const e of parsed) {
    const uids = e.comments.filter((c) => c.startsWith("uid: "));
    assert.equal(uids.length, 1, `Ð¾Ð´Ð¸Ð½ uid-ÐºÐ¾Ð¼Ð¼ÐµÐ½ÑÐ°ÑÐ¸Ð¹ Ñ Â«${e.msgid.slice(0, 30)}Â»`);
    assert.match(uids[0], /^uid: [0-9a-f]{32}$/);
    assert.equal(uids[0].slice(5), md5(e.msgid), "uid Ð² ÐºÐ¾Ð¼Ð¼ÐµÐ½ÑÐ°ÑÐ¸Ð¸ ÑÐ¾Ð²Ð¿Ð°Ð´Ð°ÐµÑ Ñ md5(msgid)");
  }
});

test("emotion ÐºÐ¾Ð¼Ð¼ÐµÐ½ÑÐ¸ÑÑÐµÑÑÑ ÑÐ¾Ð»ÑÐºÐ¾ Ð´Ð»Ñ speaker:* (Ð¼ÐµÐ½Ñ Ð¸ ui â Ð±ÐµÐ·)", () => {
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
    "ÑÐ¼Ð¾ÑÐ¸Ñ ÑÐµÐ¿Ð»Ð¸ÐºÐ¸ ÑÐ¿Ð¸ÐºÐµÑÐ°",
  );
  assert.equal(
    catalog.entries.get("speaker:Narrator\u0000The wind howls.")?.emotion,
    "Ominously",
    "ÑÐ¼Ð¾ÑÐ¸Ñ Ð½Ð°ÑÑÐ°ÑÐ¾ÑÐ° (Ð¾Ð½ ÑÐµÐ¿ÐµÑÑ ÑÐ¿Ð¸ÐºÐµÑ)",
  );
  assert.equal(catalog.entries.get("menu\u0000Take the sword")?.emotion, undefined, "Ð¼ÐµÐ½Ñ Ð±ÐµÐ· ÑÐ¼Ð¾ÑÐ¸Ð¸");
  assert.equal(catalog.entries.get("ui\u0000Continue")?.emotion, undefined, "ui Ð±ÐµÐ· ÑÐ¼Ð¾ÑÐ¸Ð¸");

  const pot = renderPot(catalog, new Date(0));
  assert.ok(pot.includes("#. emotion: In a warm, affectionate tone"));
  assert.ok(pot.includes("#. emotion: Ominously"));
  assert.ok(!pot.includes("menu must not get emotion"));
  assert.ok(!pot.includes("ui must not get emotion"));
});

test("Ð¼Ð¸Ð³ÑÐ°ÑÐ¸Ñ emotion_new: Ð´Ð²Ð° ÑÐ»Ð¾Ñ ÑÐ¾Ð½Ð° Ð½Ðµ Ð¼ÐµÑÐ°ÑÑ Ð´ÑÑÐ³ Ð´ÑÑÐ³Ñ (2026-10-26)", () => {
  // Ð ÐµÑÐµÐ½Ð¸Ðµ Ð²Ð»Ð°Ð´ÐµÐ»ÑÑÐ°: Ð½Ð¾Ð²ÑÐ¹ ÑÐ¾Ð½ Ð¿Ð¸ÑÐµÑÑÑ Ð Ð¯ÐÐÐ ÑÐ¾ ÑÑÐ°ÑÑÐ¼ (`#. emotion_new:`),
  // Ñ ÑÐ¶Ðµ ÑÐ³ÐµÐ½ÐµÑÐ¸ÑÐ¾Ð²Ð°Ð½Ð½Ð¾Ð³Ð¾ Ð·Ð²ÑÐºÐ° Ð¾ÑÑÐ°ÑÑÑÑ ÐµÐ³Ð¾ ÑÐ¾Ð½Ð°Ð»ÑÐ½Ð¾ÑÑÑ â Ð¿Ð»Ð°Ð²Ð½ÑÐ¹ Ð¿ÐµÑÐµÑÐ¾Ð´.
  const gameDir = makeFixtureGame();
  const md5 = (t: string): string => createHash("md5").update(t, "utf8").digest("hex");
  const uidHello = md5("Hello there!");
  const uidWind = md5("The wind howls.");
  const catalog = scanGame(gameDir, {
    emotions: { [uidHello]: "Old warm tone", [uidWind]: "Old narr tone" },
    emotionsNew: { [uidHello]: "New bright tone" },
  });

  const s = catalog.entries.get("speaker:Sarah\u0000Hello there!");
  assert.equal(s?.emotion, "Old warm tone", "ÑÑÐ°ÑÑÐ¹ ÑÐ»Ð¾Ð¹ ÐÐ Ð¿ÐµÑÐµÑÑÑÑ");
  assert.equal(s?.emotionNew, "New bright tone", "Ð½Ð¾Ð²ÑÐ¹ ÑÐ»Ð¾Ð¹ Ð»ÐµÐ¶Ð¸Ñ ÑÑÐ´Ð¾Ð¼");
  const w = catalog.entries.get("speaker:Narrator\u0000The wind howls.");
  assert.equal(w?.emotion, "Old narr tone");
  assert.equal(w?.emotionNew, undefined, "Ð±ÐµÐ· Ð½Ð¾Ð²Ð¾Ð³Ð¾ ÑÐ»Ð¾Ñ â undefined");

  const pot = renderPot(catalog, new Date(0));
  assert.ok(pot.includes("#. emotion: Old warm tone"), "ÑÑÐ°ÑÑÐ¹ ÐºÐ¾Ð¼Ð¼ÐµÐ½ÑÐ°ÑÐ¸Ð¹ Ð²ÑÐ²Ð¾Ð´Ð¸ÑÑÑ");
  assert.ok(pot.includes("#. emotion_new: New bright tone"), "Ð½Ð¾Ð²ÑÐ¹ ÐºÐ¾Ð¼Ð¼ÐµÐ½ÑÐ°ÑÐ¸Ð¹ Ð²ÑÐ²Ð¾Ð´Ð¸ÑÑÑ");
  assert.ok(!pot.includes("#. emotion_new: Old narr tone"), "Ð½Ð¾Ð²ÑÐ¹ ÑÐ»Ð¾Ð¹ Ð½Ðµ Ð·Ð°ÑÐ¾ÑÑÐµÑÑÑ ÑÑÐ°ÑÑÐ¼");

  // roundtrip: Ð¾Ð±Ð° ÑÐ»Ð¾Ñ ÑÐ¸ÑÐ°ÑÑÑÑ Ð¾Ð±ÑÐ°ÑÐ½Ð¾ Ð¸ ÐÐ Ð¿ÑÑÐ°ÑÑÑÑ (prefix-ÑÐ°Ð·Ð´ÐµÐ»ÐµÐ½Ð¸Ðµ)
  assert.equal(loadEmotionsFromPot(pot)[uidHello], "Old warm tone");
  assert.deepEqual(loadEmotionsFromPot(pot, "emotion_new:"), { [uidHello]: "New bright tone" });
  assert.equal(loadEmotionsFromPot(pot, "emotion_new:")[uidWind], undefined);
});

test("Ð±ÐµÐ· opts ÑÐ¼Ð¾ÑÐ¸Ð¸ Ð½Ðµ Ð¿ÑÐ¾ÑÑÐ°Ð²Ð»ÑÑÑÑÑ; arc â Ð²ÑÐµÐ³Ð´Ð° (Ð¿ÑÐ°Ð²Ð¸Ð»Ð° Ð²ÑÑÑÐ¾ÐµÐ½Ñ)", () => {  const pot = renderPot(scanGame(makeFixtureGame()), new Date(0));
  assert.ok(!pot.includes("#. emotion:"));
  assert.ok(pot.includes("#. uid:"), "uid Ð¿Ð¸ÑÐµÑÑÑ Ð²ÑÐµÐ³Ð´Ð°");
  assert.ok(pot.includes("#. arc:"), "Ð°ÑÐºÐ° ÑÑÐ°Ð²Ð¸ÑÑÑ Ð±ÐµÐ· opts â Ð¿ÑÐ°Ð²Ð¸Ð»Ð° Ð² ÑÐ°Ð¼Ð¾Ð¼ potgen");
});

test("arcOfLabel: Ð¿ÑÐ°Ð²Ð¸Ð»Ð° Ð¸Ð· Ð¸Ð¼ÑÐ½ Ð»ÐµÐ¹Ð±Ð»Ð¾Ð² (Ð¿ÑÐµÑÐ¸ÐºÑ, ÑÐ¾ÑÐ½Ð¾Ðµ Ð¸Ð¼Ñ, ÑÐ¾Ð»Ð±ÑÐº)", () => {
  // ÐÑÐµÑÐ¸ÐºÑÐ½ÑÐµ ÑÐµÐ¼ÑÐ¸.
  assert.equal(arcOfLabel("OpeningSceneFirstMorning"), "Prologue");
  assert.equal(arcOfLabel("UnionKingdom9intermezzo1"), "UnionKingdom");
  assert.equal(arcOfLabel("TheBlackMonolithMage5"), "BlackMonolith");
  // Ð¢Ð¾ÑÐ½ÑÐµ Ð»ÐµÐ¹Ð±Ð»Ñ Ð±ÐµÐ· Ð¾Ð±ÑÐµÐ³Ð¾ Ð¿ÑÐµÑÐ¸ÐºÑÐ°.
  assert.equal(arcOfLabel("CoronationDay"), "StoryBeginnings");
  assert.equal(arcOfLabel("WarCouncil"), "WarArc");
  // Ð ÐµÐ³Ð¸ÑÑÑ-ÑÑÐ²ÑÑÐ²Ð¸ÑÐµÐ»ÐµÐ½ (case-sensitive): DemonArc1-3 â Ð°ÑÐºÐ°;
  // Demonarc4/5 â Ð²Ð½Ðµ ÑÐµÐ¼ÑÐ¸ â Other (Ð¿Ð°ÑÐ¸ÑÐµÑ Ð¿ÑÐµÐ¶Ð½ÐµÐ³Ð¾ label_arc.json).
  assert.equal(arcOfLabel("DemonArc2"), "DemonArc");
  assert.equal(arcOfLabel("Demonarc4"), "Other");
  // Ð¡ÐµÐ¼ÐµÐ¹Ð½ÑÐµ Ð¸Ð¼ÐµÐ½Ð°, Ð² ÑÑÐ¶Ð¾Ð¼ ÐºÐ¾Ð½ÑÐµÐºÑÑÐµ, â Ð½Ðµ ÑÑÐ¶Ð°Ñ Ð°ÑÐºÐ° (Ð½Ðµ-ÑÐµÐ¼ÐµÐ¹Ð½ÑÐµ).
  assert.equal(arcOfLabel("MarionOrVargaPath"), "Other");
  assert.equal(arcOfLabel("NeitherPath4"), "Other");
  // Ð¤Ð¾Ð»Ð±ÑÐº: Ð»ÑÐ±ÑÐµ Ð½ÐµÐ¸Ð·Ð²ÐµÑÑÐ½ÑÐµ ÑÑÐ¶ÐµÑÐ½ÑÐµ Ð»ÐµÐ¹Ð±Ð»Ñ (Ð½Ð¾Ð²Ð¸Ð·Ð½Ð° Ð¸Ð³ÑÑ) â Other.
  assert.equal(arcOfLabel("BrandNewLabelFromUpdate"), "Other");
  // ÐÐµ-ÑÑÐ¶ÐµÑ: splashscreen Ð±ÐµÐ· Ð°ÑÐºÐ¸ (Ð³Ð°Ð»ÐµÑÐµÐ¹Ð½ÑÐµ â Ð½Ð° ÑÑÐ¾Ð²Ð½Ðµ ÑÐ°Ð¹Ð»Ð°, Ð½Ð¸Ð¶Ðµ).
  assert.equal(arcOfLabel("splashscreen"), undefined);
  // ÐÐ¾ÐºÑÐ¼ÐµÐ½ÑÐ¸ÑÐ¾Ð²Ð°Ð½Ð½ÑÐµ ÑÐ¸ÐºÑÑ Ð°ÑÑÐµÑÐ°ÐºÑÐ¾Ð² ÑÐµÐºÑÑ-ÑÐµÐ·Ð¾Ð»Ð²Ð° Ð¿ÑÐµÐ¶Ð½ÐµÐ³Ð¾ label_arc.json.
  assert.equal(arcOfLabel("VargaPath5"), "VargaMarionPath", "Ð±ÑÐ» Prologue â Ð°ÑÑÐµÑÐ°ÐºÑ ÑÐµÐ·Ð¾Ð»Ð²Ð°");
  assert.equal(arcOfLabel("TrainingPathKate3"), "Training", "Ð±ÑÐ» Other â ÑÐµÐ¼ÑÑ TrainingPath*");
});

test("arc/scene Ð·Ð°Ð¿Ð¸ÑÐµÐ¹: Ð²Ð½ÑÑÑÐ¸ label Ð¿Ð¾ Ð¿ÑÐ°Ð²Ð¸Ð»Ð°Ð¼, ÑÐ½Ð°ÑÑÐ¶Ð¸ â Ð±ÐµÐ· ÑÐºÐ¾ÑÐµÐ¹; Ð³Ð°Ð»ÐµÑÐµÐ¸ Ð¸ÑÐºÐ»ÑÑÐµÐ½Ñ", () => {
  const catalog = scanGame(makeFixtureGame());
  const e = (key: string): { arc?: string; scene?: string } | undefined => catalog.entries.get(key);
  // Ð¤Ð¸ÐºÑÑÑÑÐ½ÑÐµ ÑÑÐ¶ÐµÑÐ½ÑÐµ Ð»ÐµÐ¹Ð±Ð»Ñ Ð¿ÑÐ°Ð²Ð¸Ð»Ð°Ð¼ Ð½ÐµÐ¸Ð·Ð²ÐµÑÑÐ½Ñ â ÑÐ¾Ð»Ð±ÑÐº Other.
  assert.equal(e("speaker:Sarah\u0000Hello there!")?.arc, "Other");
  assert.equal(e("speaker:Narrator\u0000The wind howls.")?.arc, "Other");
  assert.equal(e("menu\u0000Take the sword")?.arc, "Other", "Ð¼ÐµÐ½Ñ Ð²Ð½ÑÑÑÐ¸ label Ð½ÐµÑÑÑ Ð°ÑÐºÑ");
  // Ð¡ÑÐµÐ½Ð° â ÑÐ°Ð¼ label (ÑÐ¾Ð½ÑÑÐµ Ð°ÑÐºÐ¸).
  assert.equal(e("speaker:Sarah\u0000Hello there!")?.scene, "scene_one");
  assert.equal(e("menu\u0000Take the sword")?.scene, "scene_one");
  // ÐÐµÐ´ÑÐ¿ (Ð¿ÐµÑÐ²ÑÐ¹ label-Ð²Ð»Ð°Ð´ÐµÐ»ÐµÑ Ð¿Ð¾Ð±ÐµÐ¶Ð´Ð°ÐµÑ): ÑÑÐ°Ð·Ð° Ð² OpeningScene (Prologue)
  // Ð¸ UnionKingdom1 (UnionKingdom) â ÑÐºÐ¾ÑÑ Ð¿ÐµÑÐ²Ð¾Ð¹ Ð²ÑÑÑÐµÑÐ¸, Ð½Ðµ Ð²ÑÐ¾ÑÐ¾Ð¹.
  assert.equal(e("speaker:Sarah\u0000Shared cross-arc line.")?.arc, "Prologue");
  assert.equal(e("speaker:Sarah\u0000Shared cross-arc line.")?.scene, "OpeningScene");
  // Ð¡Ð½Ð°ÑÑÐ¶Ð¸ label: define-Ð¸Ð¼ÐµÐ½Ð° Ð¸ ui-ÑÑÑÐ¾ÐºÐ¸ â Ð±ÐµÐ· Ð°ÑÐºÐ¸ Ð¸ ÑÑÐµÐ½Ñ.
  assert.equal(e("speaker-name\u0000Sarah")?.arc, undefined);
  assert.equal(e("speaker-name\u0000Sarah")?.scene, undefined);
  assert.equal(e("ui\u0000Continue")?.arc, undefined);
  assert.equal(e("ui\u0000Continue")?.scene, undefined);
  // ÐÐ°Ð»ÐµÑÐµÐ¹Ð½ÑÐµ ÑÐ°Ð¹Ð»Ñ (art.rpy, replay_gallery.rpy): Ð»ÐµÐ¹Ð±Ð»Ñ ÑÐºÐ°Ð½Ð¸ÑÑÑÑÑÑ,
  // Ð½Ð¾ Ð¸Ñ ÑÑÑÐ¾ÐºÐ¸ â Ð±ÐµÐ· ÑÐºÐ¾ÑÐµÐ¹.
  assert.equal(e("speaker:Sarah\u0000Gallery arc line.")?.arc, undefined);
  assert.equal(e("speaker:Sarah\u0000Gallery arc line.")?.scene, undefined);
  assert.equal(e("speaker:Narrator\u0000Replay arc line.")?.arc, undefined);
  assert.equal(e("speaker:Narrator\u0000Replay arc line.")?.scene, undefined);

  // Ð ÐµÐ½Ð´ÐµÑ: #. arc:/#. scene: Ð´Ð¾ÑÐ¾Ð´ÑÑ Ð´Ð¾ POT-ÑÐµÐºÑÑÐ°, Ñ Ð½Ðµ-ÑÑÐ¶ÐµÑÐ½ÑÑ â Ð½ÐµÑ.
  const pot = renderPot(catalog, new Date(0));
  assert.ok(pot.includes("#. arc: Prologue"));
  assert.ok(pot.includes("#. scene: OpeningScene"));
  const parsed = parsePo(pot).filter((x) => x.msgid);
  const byId = new Map(parsed.map((x) => [`${x.msgctxt}\u0000${x.msgid}`, x.comments]));
  const shared = byId.get("speaker:Sarah\u0000Shared cross-arc line.") ?? [];
  assert.ok(shared.some((c) => c === "arc: Prologue"));
  assert.ok(shared.some((c) => c === "scene: OpeningScene"));
  const uiComments = byId.get("ui\u0000Continue") ?? [];
  assert.ok(!uiComments.some((c) => c.startsWith("arc: ") || c.startsWith("scene: ")), "ui-Ð·Ð°Ð¿Ð¸ÑÑ Ð±ÐµÐ· ÑÐºÐ¾ÑÐµÐ¹");
});
