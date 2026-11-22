/**
 * Оракул индекса: Rust-ускоритель обязан совпадать с TS-парсером на реальных
 * файлах. Если бинаря нет (свежий клон без cargo build) — тест пропускается,
 * но CI с собранным бинарём ловит любое расхождение парсеров.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

const ROOT = join(import.meta.dirname, "..");
const BIN = join(
  ROOT,
  "tools",
  "po-index",
  "target",
  "release",
  process.platform === "win32" ? "po-index.exe" : "po-index",
);
const PO_DIR = join(ROOT, "patches", "ai-voice-pack", "po");

test("Rust-индекс: счётчики совпадают с TS-парсером (паритет)", { skip: !existsSync(BIN) }, () => {
  const out = execFileSync(BIN, ["--pot", join(PO_DIR, "template.pot"), "--po-dir", PO_DIR], {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const index = JSON.parse(out) as {
    pot: { entries: number };
    po: Record<string, { entries: number; filled: number }>;
  };

  const potEntries = parsePo(readFileSync(join(PO_DIR, "template.pot"), "utf-8")).filter((e) => e.msgid.trim() !== "");
  assert.equal(index.pot.entries, potEntries.length, "POT: разошлось число записей");

  // en — исходный язык, po/en.po не существует: берём реальные переводы.
  for (const lang of ["ru", "de", "zh"]) {
    const entries = parsePo(readFileSync(join(PO_DIR, `${lang}.po`), "utf-8")).filter((e) => e.msgid.trim() !== "");
    const filled = entries.filter((e) => e.msgstr.trim() !== "").length;
    assert.equal(index.po[lang]?.entries, entries.length, `${lang}: записей`);
    assert.equal(index.po[lang]?.filled, filled, `${lang}: переводов`);
  }
});
