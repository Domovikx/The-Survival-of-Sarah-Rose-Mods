/**
 * vox_opus.mts — отдельный конвертер wav -> opus (заказ владельца 2026-10-28).
 *
 *   node vox_opus.mts [--dir <папка>] [--lang ru] [--filter <строка>] [--rate N] [--dry-run]
 *
 * Дефолт --rate 48000 (Vox-стандарт 2026-10-28: OpusHead 48000, битрейт 24k;
 * кози-контракт 24000 — явно через --rate 24000).
 * opus-кодек НЕ имеет 36k-режима (только 8/12/16/24/48) — 36 = стоп.
 * Битрейт фиксирован корпусным 24k (см. voicekit/audio.wavToOpus).
 *
 * БЕЗОПАСНОСТЬ (инцидент 2026-10-27: чужой opus перезаписан): существующий
 * .opus НИКОГДА не перезаписывается — пропуск с пометкой; корпус цел.
 * Exit 1 = были ошибки конвертации; пропуски — не ошибка.
 */
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { PKG_ROOT } from "./voice_batch.mts";
import { wavToOpus } from "./voicekit/audio.mts";

/** Частоты, которые реально поддерживает opus-кодек. */
export const OPUS_RATES = [8000, 12000, 16000, 24000, 48000] as const;

export interface OpusCli {
  dir: string;
  lang: string;
  filter: string;
  rate: number;
  dryRun: boolean;
  help: boolean;
}

export function parseOpusCli(argv: string[]): OpusCli {
  const o: OpusCli = { dir: "", lang: "ru", filter: "", rate: 48000, dryRun: false, help: false };
  let i = 0;
  const next = (): string => {
    const v = argv[++i];
    if (v === undefined) throw new Error(`нет значения после ${argv[i - 1]}`);
    return v;
  };
  for (; i < argv.length; i++) {
    switch (argv[i]) {
      case "--dir":
        o.dir = next();
        break;
      case "--lang":
        o.lang = next();
        break;
      case "--filter":
        o.filter = next();
        break;
      case "--rate": {
        const k = Number(next());
        if (!Number.isFinite(k) || !OPUS_RATES.includes(k as (typeof OPUS_RATES)[number])) {
          throw new Error(
            `--rate ${k}: opus поддерживает только 8000/12000/16000/24000/48000 — 36k-режима у кодека НЕТ`,
          );
        }
        o.rate = k;
        break;
      }
      case "--dry-run":
        o.dryRun = true;
        break;
      case "--help":
      case "-h":
        o.help = true;
        break;
      default:
        throw new Error(`неизвестная опция: ${argv[i]} (есть --dir/--lang/--filter/--rate/--dry-run/--help)`);
    }
  }
  if (!o.dir) o.dir = join(PKG_ROOT, "audio", `vo_${o.lang}`);
  return o;
}

export const OPUS_USAGE = [
  "vox_opus.mts — конвертер wav -> opus (атомарно, .part -> rename)",
  "  --dir <папка>   что конвертировать (дефолт: audio/vo_<lang>)",
  "  --lang <ru>     язык для дефолтного --dir",
  "  --filter <строка> только файлы, содержащие строку",
  "  --rate <N>      частота opus: 8000/12000/16000/24000/48000 (дефолт 48000;",
  "                  36k у opus не существует)",
  "  --dry-run       показать план без записи",
  "Существующий .opus никогда не перезаписывается (корпус не трогаем).",
].join("\n");

/** Рекурсивный сбор wav из dir. */
function collectWav(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".wav")) out.push(p);
    }
  };
  walk(dir);
  return out.toSorted();
}

async function main(): Promise<number> {
  let cli: OpusCli;
  try {
    cli = parseOpusCli(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    console.error(OPUS_USAGE);
    return 1;
  }
  if (cli.help) {
    console.log(OPUS_USAGE);
    return 0;
  }

  let files: string[];
  try {
    files = collectWav(cli.dir);
  } catch (e) {
    console.error(`папка недоступна: ${cli.dir} (${e instanceof Error ? e.message : String(e)})`);
    return 1;
  }
  if (cli.filter) files = files.filter((f) => f.includes(cli.filter));
  if (files.length === 0) {
    console.error(`нет wav в ${cli.dir}${cli.filter ? ` (filter=${cli.filter})` : ""}`);
    return 1;
  }

  console.log(`конвертер opus: ${files.length} wav, rate=${cli.rate}${cli.dryRun ? " (dry-run)" : ""}`);
  let converted = 0;
  let skipped = 0;
  let failed = 0;
  for (const wav of files) {
    const target = wav.replace(/\.wav$/i, ".opus");
    let exists = false;
    try {
      exists = statSync(target).isFile() && statSync(target).size > 0;
    } catch {
      exists = false;
    }
    if (exists) {
      // существующий opus (корпус/чужой) не трогаем никогда (инцидент 2026-10-27)
      skipped++;
      continue;
    }
    if (cli.dryRun) {
      console.log(`  ${relative(cli.dir, wav)} -> .opus`);
      converted++;
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    if (wavToOpus(wav, cli.rate)) converted++;
    else {
      failed++;
      console.error(`FAIL ${relative(cli.dir, wav)}`);
    }
  }
  console.log(`итог: сконвертировано ${converted}, пропущено (opus уже есть) ${skipped}, ошибок ${failed}`);
  return failed > 0 ? 1 : 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
