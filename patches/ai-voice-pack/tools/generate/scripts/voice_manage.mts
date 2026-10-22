/**
 * voice_manage.mts — быстрое управление голосами: list / status / select.
 *
 * Порт python voice_manage.py (2026-10-22: python-оркестраторы выпищены,
 * инференс остаётся в python-шимах cosyworker/voice_design).
 *
 * A/B-цикл: генерируешь вариантом (`voice_batch.mts --ref .../{Имя}_{v}.wav`),
 * слушаешь пары в audio/vo_ru/, победителя фиксируешь:
 *   node voice_manage.mts select {Имя} v   ->  {Имя}_v.wav -> {Имя}.wav
 * voice_list.json дистрибутива — АРТЕФАКТ СБОРКИ (catalog_gen.mts из
 * casts/voices.mts): реестр = VOICES, регенерация не нужна; «подключение»
 * нового голоса = add_candidate.mts (пишет реф + VOICES).
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { CASTS_DIR } from "./add_candidate.mts";
import { VOICES } from "../../../casts/voices.mts";

export function castDir(name: string): string {
  return join(CASTS_DIR, name);
}

/** Активный реф каста: озвучен = этот файл существует. */
export function refActive(name: string): string {
  return join(castDir(name), `${name}.wav`);
}

export interface VoiceInfo {
  name: string;
  /** активный реф на месте (звучит в игре). */
  active: boolean;
  /** варианты A/B: {Имя}_{v}.wav в корне каста. */
  variants: string[];
  /** отобранные кандидаты: gen_selected/*.mp3. */
  genSelected: string[];
}

/** Сводка по кастам: активный реф + варианты + отобранные кандидаты. */
export function listVoices(
  voices: Record<string, string | null> = VOICES as Record<string, string | null>,
  baseDir: string = CASTS_DIR,
): VoiceInfo[] {
  return Object.keys(voices)
    .sort()
    .map((name) => {
      const dir = join(baseDir, name);
      const files = existsSync(dir) ? readdirSync(dir) : [];
      return {
        name,
        active: !!voices[name] && existsSync(join(dir, `${name}.wav`)),
        variants: files
          .filter((f) => f.endsWith(".wav") && f.startsWith(`${name}_`))
          .map((f) => f.slice(0, -4))
          .sort(),
        genSelected: existsSync(join(dir, "gen_selected"))
          ? readdirSync(join(dir, "gen_selected"))
              .filter((f) => f.endsWith(".mp3"))
              .map((f) => f.slice(0, -4))
              .sort()
          : [],
      };
    });
}

/**
 * Фиксация активного варианта: {Имя}[_{variant}].wav -> {Имя}.wav.
 * Вариант "" = базовый реф (уже активен — no-op). 0 = успех, 1 = ошибка.
 */
export function select(name: string, variant: string, baseDir: string = CASTS_DIR): number {
  const dir = join(baseDir, name);
  const dst = join(dir, `${name}.wav`);
  if (!existsSync(dir)) {
    console.error(`✗ нет папки каста: casts/voices/${name}`);
    return 1;
  }
  const src = variant ? join(dir, `${name}_${variant}.wav`) : dst;
  if (!existsSync(src)) {
    console.error(`✗ нет ${name}${variant ? `_${variant}` : ""}.wav в корне каста`);
    return 1;
  }
  if (src === dst) {
    console.log(`= ${name}.wav уже активный реф`);
    return 0;
  }
  mkdirSync(dir, { recursive: true });
  copyFileSync(src, dst);
  console.log(`✓ ${name}_${variant}.wav → ${name}.wav`);
  console.log("  (voice_list.json — артефакт сборки из casts/voices.mts, реген не нужен)");
  return 0;
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  if (cmd === "list") {
    for (const v of listVoices()) {
      console.log(`${v.active ? "[OK]" : "[--]"} ${v.name}`);
      if (v.variants.length) console.log(`  варианты: ${v.variants.join(", ")}`);
      if (v.genSelected.length) console.log(`  gen_selected: ${v.genSelected.join(", ")}`);
    }
    return 0;
  }
  if (cmd === "status") {
    for (const v of listVoices()) {
      console.log(`  ${v.active ? "[OK]" : "[--]"} ${v.name}`);
    }
    return 0;
  }
  if (cmd === "select") {
    const [name, variant] = rest;
    if (!name) {
      console.error('Usage: node voice_manage.mts select <Имя> <вариант|"">');
      return 1;
    }
    return select(name, variant ?? "");
  }
  console.error("Usage: node voice_manage.mts {list|status|select <Имя> <вариант>}");
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
