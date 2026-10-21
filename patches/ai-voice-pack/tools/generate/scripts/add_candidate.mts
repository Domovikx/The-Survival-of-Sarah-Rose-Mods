/**
 * add_candidate.mts — добавление отобранного кандидата в реф каста.
 *
 * ПОРТ add_candidate.py (2026-10-21):
 *  1. сканирует casts/voices/{Имя}/gen_selected/*.mp3
 *     (ОДИН файл с ЛЮБЫМ именем -> {Имя}.wav; несколько -> первый {Имя}.wav,
 *      остальные {Имя}_2.wav, {Имя}_3.wav...)
 *  2. первые N секунд (refs.target_len) -> сжатие пауз -> чистка (денойз+EQ
 *     +loudnorm -16 LUFS) -> корень каста {Имя}[_{v}].wav
 *  3. подключает голос: VOICES в casts/voices.mts null -> путь к рефу
 *     (в python это делал gen_voice_list_json в каталог — мапа теперь
 *     типизированный TS, поэтому декларация идёт прямо в voices.mts)
 *
 * Файлы идемпотентны: существующий реф НЕ перетирается (как python).
 *
 * ЗАПУСК:
 *   node patches/ai-voice-pack/tools/generate/scripts/add_candidate.mts --only Oryon
 *   npm run refs:add -- --only Oryon
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { get } from "./config.mts";
import { compressPausesFile, cleanFile, probeDuration, runOk } from "./clean_refs.mts";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(SCRIPTS_DIR, "..", "..", "..");
export const CASTS_DIR = join(PKG_ROOT, "casts", "voices");
const VOICES_MTS = join(PKG_ROOT, "casts", "voices.mts");

/** Целевая длительность рефа (сек) — из config refs.target_len. */
export const TARGET_LEN = get("refs", "target_len", 10);
/** Выходная частота рефов — из config audio.sr. */
export const SR_RATE = get("audio", "sr", 24000);

/** Резка + сжатие пауз + чистка -> корень каста {Имя}[_{v}].wav. true, если создан. */
export function cutAndClean(
  name: string,
  mp3Path: string,
  opts: { variant?: string | null; preset?: string | null; castsDir?: string } = {},
): { dst: string; made: boolean } {
  const { variant = null, preset = null, castsDir = CASTS_DIR } = opts;
  const suffix = variant ? `_${variant}` : "";
  const dst = join(castsDir, name, `${name}${suffix}.wav`);
  if (existsSync(dst)) return { dst, made: false }; // реф уже есть — не трогаем
  mkdirSync(dirname(dst), { recursive: true });
  const tmp = join(castsDir, name, `${name}_tmp.wav`);

  // Режем ЛЮБОЙ mp3 до TARGET_LEN сек -> mono SR_RATE
  const dur = probeDuration(mp3Path);
  const cutEnd = Math.min(TARGET_LEN, dur);
  runOk("ffmpeg", ["-y", "-i", mp3Path, "-ss", "0", "-to", cutEnd.toFixed(3), "-ac", "1", "-ar", String(SR_RATE), tmp]);

  // Сжимаем большие паузы, чтобы в 10с влезло больше речи
  const [nCut, maxPause] = compressPausesFile(tmp, SR_RATE);
  if (nCut) {
    const target = 0.35; // как в python: значение из конфига печаталось тут же
    console.log(`    паузы: сжато ${nCut} (макс ${maxPause.toFixed(2)}с -> ${target}с)`);
  }

  // Денойз + EQ + громкость + фейды
  cleanFile(tmp, dst, { preset });
  rmSync(tmp);
  return { dst, made: true };
}

/** Касты, у которых в gen_selected лежит хотя бы один mp3. Имя папки = ключ. */
export function findCandidates(castsDir: string = CASTS_DIR): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let names: string[] = [];
  try {
    names = readdirSync(castsDir);
  } catch {
    return out;
  }
  for (const name of names) {
    const folder = join(castsDir, name, "gen_selected");
    if (!existsSync(folder)) continue;
    const mp3s = readdirSync(folder)
      .filter((f) => f.toLowerCase().endsWith(".mp3"))
      .sort()
      .map((f) => join(folder, f));
    if (mp3s.length) out[name] = mp3s;
  }
  return out;
}

/**
 * Подключить голос: в casts/voices.mts переключить {Имя}: null -> путь рефа
 * (вставляет строку перед `} as const;`, если ключа ещё нет).
 * true, если файл изменён (уже подключён — false, как python).
 */
export function declareVoice(name: string, voicesPath: string = VOICES_MTS): boolean {
  let text = readFileSync(voicesPath, "utf8");
  const key = JSON.stringify(name);
  const ref = `./voices/${name}/${name}.wav`;
  const line = `  ${key}: ${JSON.stringify(ref)},`;
  const nullRe = new RegExp(`^ {2}${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: null,$`, "m");
  if (text.includes(line)) return false;
  if (nullRe.test(text)) {
    text = text.replace(nullRe, line);
  } else if (text.includes("} as const;")) {
    text = text.replace("} as const;", `${line}\n} as const;`);
    console.warn(`  hint: ${name} не был в VOICES — добавил в конец (отсортируй по алфавиту при случае)`);
  } else {
    throw new Error(`declareVoice: не нашла VOICES = {...} as const; в ${voicesPath}`);
  }
  writeFileSync(voicesPath, text);
  return true;
}

function ffmpegAvailable(): boolean {
  return spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;
}

/** Тестовые подмены путей (боевые — CASTS_DIR/VOICES_MTS). */
export interface AddCandidateDeps {
  castsDir?: string;
  voicesPath?: string;
}

export function main(argv: string[], deps: AddCandidateDeps = {}): number {
  const castsDir = deps.castsDir ?? CASTS_DIR;
  const voicesPath = deps.voicesPath ?? VOICES_MTS;
  const { values } = parseArgs({
    args: argv,
    options: {
      only: { type: "string" },
      variants: { type: "boolean" },
    },
  });

  const all = findCandidates(castsDir);
  const only = values.only as string | undefined;
  const candidates: Record<string, string[]> = {};
  for (const [name, mp3s] of Object.entries(all)) {
    if (only && name !== only) continue;
    candidates[name] = mp3s;
  }

  const names = Object.keys(candidates);
  if (!names.length) {
    console.log(only ? `Нет mp3 кандидатов для '${only}'` : "Нет mp3 кандидатов в gen_selected/");
    return 0;
  }
  console.log(`Найдено кастов: ${len(candidates)}${only ? ` (фильтр: ${only})` : ""}`);
  if (!ffmpegAvailable()) {
    console.error("ffmpeg не найден в PATH — прерываю (рефы не собрать)");
    return 1;
  }

  const touched: string[] = [];
  for (const name of names.sort()) {
    const mp3s = candidates[name] ?? [];
    const multiple = mp3s.length > 1;
    const useVariants = values.variants || multiple;

    console.log(`\n=== ${name} (${mp3s.length} mp3) ===`);
    for (const mp3Path of mp3s) {
      if (useVariants) {
        const base = basename(mp3Path).replace(/\.mp3$/i, "");
        const { dst, made } = cutAndClean(name, mp3Path, {
          variant: base,
          preset: null,
          castsDir,
        });
        console.log(`${made ? "OK" : "SKIP (есть)"} -> ${dst}`);
      } else {
        const { dst, made } = cutAndClean(name, mp3Path, { preset: null, castsDir });
        console.log(`${made ? "OK" : "SKIP (есть)"} -> ${dst}`);
      }
    }

    // Подключаем голос: если активный реф {Имя}.wav существует (создан раньше
    // или только что) — фиксируем в VOICES
    const activeRef = join(castsDir, name, `${name}.wav`);
    if (existsSync(activeRef)) {
      declareVoice(name, voicesPath);
      console.log(`-> VOICES: подключён ${activeRef}`);
    }
    touched.push(name);
  }
  console.log(`\nГотово: ${touched.length} кастов`);
  return 0;
}

function len(o: object): number {
  return Object.keys(o).length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
