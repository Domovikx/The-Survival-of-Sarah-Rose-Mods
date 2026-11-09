/**
 * po2tl.mts — po/<lang>.po → tl/<lang>/*.rpy (Ren'Py `translate <lang> strings:`).
 *
 * Обратный путь к историческому prefill (tl → po): машинные метаданные
 * (arc/scene) берём из template.pot через pot_resolve (DRY), переводы — из po.
 * Раскладка повторяет существующий tl/ru (проверено паритетом 2026-11-08):
 *   ui            → screens.rpy
 *   speaker-name  → misc_strings.rpy
 *   menu/speaker  → <Arc>/<Scene>.rpy
 * Внешний прецедент подхода: Beuc/renpy-ttk `mo2tl` (проверено 2026-11-08),
 * но он python и со своим форматом po — здесь свой TS-конвейер (политика проекта).
 *
 * Запуск:
 *   node .opencode/skills/renpy-po/po2tl.mts <lang> [--demo] [--dry] [--out <каталог>]
 *   (по умолчанию out = patches/ai-voice-pack/tl/<lang> — пересборка целиком;
 *    --demo — только демо-скоуп: menu + ui + speaker-name + scene=start + arc=Prologue —
 *    политика поставки 2026-11-09: в патч1 идёт ru + en, остальные языки — демо,
 *    полные переводы — по спросу (бусти/площадки), в патч их не кладём)
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ALL_LANGS, parsePo, poEscape, type PoEntry } from "./po_core.mts";
import { loadPotIndex, type PotMeta } from "./pot_resolve.mts";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SKILL_DIR, "..", "..", "..");

export interface TlFile {
  /** Относительный путь внутри tl/<lang>/, например "Prologue/OpeningScene.rpy". */
  rel: string;
  body: string;
}

const HEADER = "# -*- encoding: utf-8 -*-";

/** Сцены демо-скоупа сверх арки Prologue (поставка 2026-11-09, решение
 *  владельца: «маркетинг и крючки важны» — смерть отца, детектив-вопрос
 *  «Кто захотел навредить папе?», романтические тизеры (Кейт/Варга) и
 *  финал на ПЕРВОМ ВЫБОРЕ (интерактивность = триггер купить полную игру):
 *  демо-скоуп = menu/ui/имена + start + Prologue + сцены по ChooseThePath). */
export const DEMO_SCENES = new Set([
  "start",
  "DayOfTheFuneral",
  "MeetingOnTheBattlements",
  "MeetingKateInTheGarden",
  "SecondPartOfFuneral",
  "SarahsBedroomAfterFuneral",
  "TheMorningAfterKate",
  "CoronationDay",
  "ChooseThePath",
]);

/** Демо-скоуп поставки: меню/имена + старт + Prologue + сцены-крючки (2026-11-09). */
export function isDemoScope(msgctxt: string, meta: PotMeta | null): boolean {
  if (msgctxt === "menu" || msgctxt === "ui" || msgctxt === "speaker-name") return true;
  return Boolean(meta && (meta.arc === "Prologue" || DEMO_SCENES.has(meta.scene ?? "")));
}

/** Чистая сборка: po-записи + резолвер POT-метаданных → файлы tl. */
export function buildTlFiles(
  entries: PoEntry[],
  lang: string,
  resolve: (msgctxt: string, msgid: string) => PotMeta | null,
): TlFile[] {
  const groups = new Map<string, PoEntry[]>();
  const push = (rel: string, e: PoEntry): void => {
    const arr = groups.get(rel);
    if (arr) arr.push(e);
    else groups.set(rel, [e]);
  };

  for (const e of entries) {
    if (!e.msgid || !e.msgstr.trim()) continue; // пустые — не переводились
    if (e.msgctxt === "ui") {
      push("screens.rpy", e);
    } else if (e.msgctxt === "speaker-name") {
      push("misc_strings.rpy", e);
    } else {
      const meta = resolve(e.msgctxt, e.msgid);
      const arc = meta?.arc && meta.arc !== "_unknown" ? meta.arc : "_unknown";
      const scene = meta?.scene ?? null;
      // Сцена неизвестна (дрейф POT) — в общий файл, чтобы не терять перевод.
      push(scene ? `${arc}/${scene}.rpy` : "misc_strings.rpy", e);
    }
  }

  const commentFor = (rel: string): string => {
    if (rel === "screens.rpy") return "# UI Strings - Buttons, Menus, etc.";
    if (rel === "misc_strings.rpy") return "# Character names + Define strings";
    const base = rel.replace(/\.rpy$/, "").split("/");
    return `# Arc: ${base[0]} | Scene: ${base[1] ?? "?"}`;
  };

  const out: TlFile[] = [];
  for (const [rel, list] of groups) {
    let body = `${HEADER}\n${commentFor(rel)}\n\ntranslate ${lang} strings:\n`;
    for (const e of list) {
      body += `\n    old "${poEscape(e.msgid)}"\n    new "${poEscape(e.msgstr)}"\n`;
    }
    out.push({ rel, body });
  }
  // Детерминизм: сортировка по пути (содержимое — в порядке po).
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

function main(): void {
  const lang = process.argv[2];
  if (!lang || !ALL_LANGS.includes(lang)) {
    console.error(`Использование: po2tl.mts <lang> [--dry] [--out <каталог>]; lang из: ${ALL_LANGS.join(", ")}`);
    process.exit(1);
  }
  const dry = process.argv.includes("--dry");
  const demoOnly = process.argv.includes("--demo");
  const outArg = process.argv.indexOf("--out");
  const outRoot = outArg >= 0 ? process.argv[outArg + 1] : join(REPO_ROOT, "patches", "ai-voice-pack", "tl", lang);

  const poText = readFileSync(join(REPO_ROOT, "patches", "ai-voice-pack", "po", `${lang}.po`), "utf-8").replace(
    /\r\n/g,
    "\n",
  );
  const pot = loadPotIndex();
  let entries = parsePo(poText).filter((e) => e.msgid);
  if (demoOnly) entries = entries.filter((e) => isDemoScope(e.msgctxt, pot.resolve(e.msgctxt, e.msgid)));
  const files = buildTlFiles(entries, lang, (c, m) => pot.resolve(c, m));

  let pairs = 0;
  for (const f of files) pairs += (f.body.match(/^\s+old /gm) ?? []).length;
  console.log(
    `po2tl ${lang}: файлов ${files.length}, пар old/new ${pairs}, out = ${outRoot}${dry ? " (dry — не пишу)" : ""}`,
  );
  if (dry) {
    for (const f of files.slice(0, 8)) console.log(`  ${f.rel} (${(f.body.match(/^\s+old /gm) ?? []).length})`);
    if (files.length > 8) console.log(`  … и ещё ${files.length - 8}`);
    return;
  }

  // Пересборка целиком: только внутри tl/<lang> (защита от случайного out).
  if (existsSync(outRoot)) rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
  for (const f of files) {
    const path = join(outRoot, f.rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, f.body, "utf-8");
  }
  console.log(`записано ${files.length} файлов в ${outRoot}`);
}

// Запуск только при прямом вызове (не при импорте из тестов).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
