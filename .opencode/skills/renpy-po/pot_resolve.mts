/**
 * pot_resolve.mts — ОБРАТНЫЙ ПАЙПЛАЙН «po-запись → pot[arc, scene, uid, emotion]».
 *
 * DRY (задача 2026-10-23-dry-emotion-only-in-pot): машинные метаданные живут
 * ТОЛЬКО в po/template.pot, языковые po/*.po несут одни переводы. Кто-то при
 * озвучке/переводе/ревью хочет тон и арку — берёт здесь, по ключу
 * (msgctxt, msgid), как уже делал voice_batch.loadCatalog (там POT-обход был
 * напрямую; общий модуль — чтобы po_translate/ревью/будущие тулы не парсили
 * POT каждый своей копией).
 *
 * ЗАПУСК (диагностика):
 *   node .opencode/skills/renpy-po/pot_resolve.mts
 *   (печатает размер индекса и пару примеров резолва)
 *
 * uid = md5(msgid) — та же формула, что у potgen/voice_batch (язык-независима).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parsePo } from "./po_core.mts";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SKILL_DIR, "..", "..", "..");
export const DEFAULT_POT = join(REPO_ROOT, "patches", "ai-voice-pack", "po", "template.pot");

/** Метаданные фразы в POT, доступные обратным пайплайном. */
export interface PotMeta {
  /** md5(msgid) — uid каталога/аудио. */
  uid: string;
  /** Арка (комментарий `#. arc:`); "_unknown" — нет в POT. */
  arc: string;
  /** Сцена (`#. scene:`), null — не указана. */
  scene: string | null;
  /** Тон диктора (`#. emotion:`), null — не задан (не speaker-строка). */
  emotion: string | null;
  /** Категория: dialogue | narration | menu | ui (правила как в voice_batch). */
  category: string;
  /** Для speaker:* — имя говорящего (без префикса), иначе null. */
  speaker: string | null;
}

const key = (msgctxt: string, msgid: string): string => `${msgctxt}\u0000${msgid}`;

const commentOf = (comments: string[], prefix: string): string | null => {
  const c = comments.find((x) => x.startsWith(prefix));
  return c ? c.slice(prefix.length).trim() : null;
};

/** Индекс POT по ключу (msgctxt, msgid). Строится один раз на процесс. */
export class PotIndex {
  private readonly byKey = new Map<string, PotMeta>();

  constructor(potText: string) {
    for (const e of parsePo(potText)) {
      if (!e.msgid) continue; // заголовок
      const k = key(e.msgctxt, e.msgid);
      if (this.byKey.has(k)) continue; // детерминизм: первая запись побеждает
      const meta = commentOf(e.comments, "arc:");
      let category: string;
      let speaker: string | null = null;
      if (e.msgctxt.startsWith("speaker:")) {
        const name = e.msgctxt.slice("speaker:".length);
        if (name === "Narrator") category = "narration";
        else {
          category = "dialogue";
          speaker = name;
        }
      } else if (e.msgctxt === "menu") {
        category = "menu";
      } else {
        category = "ui"; // ui + speaker-name (имена) — не речь
      }
      this.byKey.set(k, {
        uid: createHash("md5").update(e.msgid, "utf8").digest("hex"),
        arc: meta ?? "_unknown",
        scene: commentOf(e.comments, "scene:"),
        emotion: commentOf(e.comments, "emotion:"),
        category,
        speaker,
      });
    }
  }

  /** Обратный резолв: po-запись -> метаданные POT; нет в POT -> null (дрейф). */
  resolve(msgctxt: string, msgid: string): PotMeta | null {
    return this.byKey.get(key(msgctxt, msgid)) ?? null;
  }

  /** Только тон (частый случай): null, если строки нет в POT или тона нет. */
  emotion(msgctxt: string, msgid: string): string | null {
    return this.resolve(msgctxt, msgid)?.emotion ?? null;
  }

  get size(): number {
    return this.byKey.size;
  }
}

/** Готовый индекс из файла (по умолчанию — template.pot). */
export function loadPotIndex(path: string = DEFAULT_POT): PotIndex {
  if (!existsSync(path)) {
    throw new Error(`template.pot не найден: ${path} (запусти npm run potgen)`);
  }
  return new PotIndex(readFileSync(path, "utf-8"));
}

// Диагностика при прямом запуске: node pot_resolve.mts
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const idx = loadPotIndex();
  console.log(`POT-индекс: ${idx.size} записей (${DEFAULT_POT})`);
  const probe = [
    ["speaker:Narrator", "Al'Gahaem was a city that was hard for Sarah to wrap her mind around."],
    ["speaker:Sarah", "AAAAH!!"],
    ["speaker:NoSuch", "нет такой строки — ждём null"],
  ] as Array<[string, string]>;
  for (const [c, m] of probe) {
    console.log(`  ${c} / ${m.slice(0, 50)} ->`, idx.resolve(c, m));
  }
}
