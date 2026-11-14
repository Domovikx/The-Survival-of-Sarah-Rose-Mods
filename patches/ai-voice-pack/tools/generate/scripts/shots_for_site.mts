#!/usr/bin/env node
/** Скриншоты игры -> лендинг: tmp/shots/*.png -> site/public/shots/*.jpg.
 *
 * Порт python shots_for_site.py -> TS (миграция python → .mts, 2026-11-12).
 *
 * Отбор кадров (харнесс zz_capture.rpy из scripts/, деплой драйвером в
 * <игра>/mods/_tssr-test, запуск — scripts/shots_capture.ps1;
 * game-режим: 24 кадра каждые 2.5с, лучшие с ОТКРЫТЫМ текстовым окном — ревью
 * владельца 2026-10-16: «кадры без текста скучноватые»). Порядок в галерее
 * задаёт Screenshots.tsx, здесь — только соответствие stem -> кадр:
 *   main_menu          <- {ru|en}_menu.png           главное меню (бейдж яркий)
 *   language_settings  <- {ru|en}_settings.png       страница патча (ПЕРВЫМ в галерее)
 *   dialogue_1         <- {ru|en}_dialogue5.png      CG: объятия с репликой
 *   dialogue_2         <- {ru|en}_dialogue3.png      король в дверях + наррация
 *   dialogue_3         <- ru: dialogue11, en: 12     у окна, длинные реплики
 *   dialogue_4         <- {ru|en}_dialogue1.png      панорама столицы + наррация
 *   badge_{russian|chinese} <- BADGES ниже: правый верх ГЛАВНОГО МЕНЮ + красная
 *                        рамка вокруг пилюли языка (оба кадра — один замер,
 *                        меняется только подпись ENG/RUS/ZHO).
 * Имена файлов сайта: {name}_{russian|english}.jpg (суффикс = версия игры,
 * её выбирает Screenshots.tsx по i18n-языку).
 *
 * Обработка: ресайз 1920x1080 (16:9, сайт кладёт width:100%), JPEG q=3
 * (~совпадает с прежними 2080x1170 по качеству, меньше по весу).
 *
 * Запуск из корня репы:
 *     node patches/ai-voice-pack/tools/generate/scripts/shots_for_site.mts
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** Корень репы: поднимаемся от scripts/ до site/public/ (маяк) + patches/. */
function findRepoRoot(): string {
  let p = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(p, "site", "public")) && existsSync(join(p, "patches"))) return p;
    const parent = dirname(p);
    if (parent === p) throw new Error(`не найден корень репы (site/public) от ${p}`);
    p = parent;
  }
}

const ROOT = findRepoRoot();
const SRC = join(ROOT, "tmp", "shots");
const DST = join(ROOT, "site", "public", "shots");

/** суффикс файла сайта -> префикс кадра в tmp/shots и набор отобранных снимков.
 * Значение pick: короткое имя -> кадр {prefix}_{name}.png; имя с языковым
 * префиксом (de_/zh_/...) -> кадр берётся как есть (мастерскриншоты владельца
 * 2026-11-11: «нет переключателя языков, нет китайского и немецкого»). */
const PLAN: Record<string, [string, Record<string, string>]> = {
  russian: [
    "ru",
    {
      main_menu: "menu",
      language_settings: "ru_ls3_set_ru",
      dialogue_1: "dialogue5",
      dialogue_2: "de_dialogue3",
      dialogue_3: "zh_dialogue11",
      dialogue_4: "dialogue1",
    },
  ],
  english: [
    "en",
    {
      main_menu: "menu",
      language_settings: "en_ls2_set_en",
      dialogue_1: "dialogue5",
      dialogue_2: "de_dialogue3",
      dialogue_3: "zh_dialogue11", // CJK без квадратов — крючок
      dialogue_4: "dialogue1",
    },
  ],
};
const LANG_PREFIXES = new Set(["ru", "en", "de", "es", "fr", "it", "ja", "ko", "pl", "pt", "zh"]);

/** Бейдж языка для шага «Установка»: правый верхний угол ГЛАВНОГО МЕНЮ +
 * красная рамка вокруг пилюли. Кадр один и тот же по геометрии для всех
 * языков (меняется только подпись ENG/RUS/ZHO), поэтому рамка — константы:
 * пилюля в кадре 1920x1080 при xalign 0.995/yalign 0.012.
 * suffix -> кадр из tmp/shots без префикса языка. */
const BADGES: Record<string, string> = {
  russian: "ru_menu",
  chinese: "zh_menu",
};
const BADGE_VER = { w: 640, h: 280, x: 1280, outW: 960, outH: 420, box: "x=833:y=12:w=124:h=76" };

function badges(): number {
  let failed = 0;
  for (const [suffix, frame] of Object.entries(BADGES)) {
    const src = join(SRC, `${frame}.png`);
    const dst = join(DST, `badge_${suffix}.jpg`);
    if (!existsSync(src)) {
      console.log(`MISS ${relative(ROOT, src).replace(/\\/g, "/")}`);
      failed++;
      continue;
    }
    const vf = [
      `crop=${BADGE_VER.w}:${BADGE_VER.h}:${BADGE_VER.x}:0`,
      `scale=${BADGE_VER.outW}:${BADGE_VER.outH}:flags=lanczos`,
      `drawbox=${BADGE_VER.box}:color=0xFF0000@1:t=4`,
    ].join(",");
    const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", src, "-vf", vf, "-q:v", "3", dst], { stdio: "inherit" });
    if (r.status !== 0) {
      console.log(`MISS ${relative(ROOT, dst).replace(/\\/g, "/")} (ffmpeg exit=${r.status})`);
      failed++;
      continue;
    }
    const kb = Math.round(statSync(dst).size / 1024);
    console.log(`OK   ${relative(ROOT, dst).replace(/\\/g, "/").padEnd(44)} ${String(kb).padStart(6)} KB`);
  }
  return failed;
}

function main(): number {
  if (!existsSync(SRC)) {
    console.error(`нет каталога ${SRC} (сначала съёмка: scripts/shots_capture.ps1)`);
    process.exit(1);
  }
  if (!existsSync(DST)) mkdirSync(DST, { recursive: true });

  let failed = 0;
  for (const suffix of Object.keys(PLAN).toSorted()) {
    const [prefix, picks] = PLAN[suffix];
    for (const name of Object.keys(picks).toSorted()) {
      const stem = picks[name];
      const frame = LANG_PREFIXES.has(stem.split("_")[0]) ? stem : `${prefix}_${stem}`;
      const src = join(SRC, `${frame}.png`);
      const dst = join(DST, `${name}_${suffix}.jpg`);
      if (!existsSync(src)) {
        console.log(`MISS ${relative(ROOT, src).replace(/\\/g, "/")}`);
        failed++;
        continue;
      }
      const r = spawnSync(
        "ffmpeg",
        ["-y", "-v", "error", "-i", src, "-vf", "scale=1920:1080:flags=lanczos", "-q:v", "3", dst],
        { stdio: "inherit" },
      );
      if (r.status !== 0) {
        console.log(`MISS ${relative(ROOT, src).replace(/\\/g, "/")} (ffmpeg exit=${r.status})`);
        failed++;
        continue;
      }
      const kb = Math.round(statSync(dst).size / 1024);
      console.log(`OK   ${relative(ROOT, dst).replace(/\\/g, "/").padEnd(44)} ${String(kb).padStart(6)} KB`);
    }
  }
  failed += badges();
  return failed ? 1 : 0;
}

process.exit(main());
