/**
 * vox_level.mts — отдельная утилита выравнивания уровня wav (заказ владельца
 * 2026-10-28): -16 LUFS / TP -1.5 (тот же normalizeWav, что у судьи).
 *
 *   node vox_level.mts [--dir <папка>] [--lang ru] [--filter <строка>] [--all] [--dry-run]
 *
 * Дефолт обрабатывает ТОЛЬКО наше сгенерированное (`*__Vox*` / `*_cfg*`); флаг
 * --all включает остальные wav — чужая правка только осознанно (инцидент
 * 2026-10-27: случайная перезапись чужих файлов). Частота входа (24k/48k)
 * определяется по ffprobe — файл остаётся на своей частоте.
 * Двухпроходный loudnorm без лимитеров (см. vox_qc --normalize — политика
 * «фильтр без искажений»). Exit 1 = были ошибки.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { PKG_ROOT } from "./voice_batch.mts";
import { normalizeOpus, normalizeWav } from "./voicekit/audio.mts";

export interface LevelCli {
  dir: string;
  lang: string;
  filter: string;
  all: boolean;
  dryRun: boolean;
  help: boolean;
}

export function parseLevelCli(argv: string[]): LevelCli {
  const o: LevelCli = { dir: "", lang: "ru", filter: "", all: false, dryRun: false, help: false };
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
      case "--all":
        o.all = true;
        break;
      case "--dry-run":
        o.dryRun = true;
        break;
      case "--help":
      case "-h":
        o.help = true;
        break;
      default:
        throw new Error(`неизвестная опция: ${argv[i]} (есть --dir/--lang/--filter/--all/--dry-run/--help)`);
    }
  }
  if (!o.dir) o.dir = join(PKG_ROOT, "audio", `vo_${o.lang}`);
  return o;
}

export const LEVEL_USAGE = [
  "vox_level.mts — выравнивание уровня wav до -16 LUFS / TP -1.5 (двухпроходно, без искажений)",
  "  --dir <папка>     что выравнивать (дефолт: audio/vo_<lang>)",
  "  --lang <ru>       язык для дефолтного --dir",
  "  --filter <строка> только файлы, содержащие строку",
  "  --all              включить ВСЕ wav (без флага — только наши *__Vox* / *_cfg*)",
  "  --dry-run          показать план без записи",
  "Поддерживает .wav и .opus (opus = второе поколение сжатия).",
].join("\n");

/** Наше сгенерированное (судится/собирается нами): `_Vox_` или матричное `_cfg…_ts…`. */
function isOurs(name: string): boolean {
  return name.includes("__Vox") || /_cfg[\d.]+_ts\d+/.test(name);
}

/** Частота входа (ffprobe); null -> пропуск файла с ошибкой. */
function probeRate(file: string): number | null {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate", "-of", "csv=p=0", file],
    {
      encoding: "utf8",
      windowsHide: true,
      timeout: 60_000,
    },
  );
  const n = Number((r.stdout ?? "").trim());
  return r.status === 0 && Number.isFinite(n) && n > 0 ? n : null;
}

async function main(): Promise<number> {
  let cli: LevelCli;
  try {
    cli = parseLevelCli(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    console.error(LEVEL_USAGE);
    return 1;
  }
  if (cli.help) {
    console.log(LEVEL_USAGE);
    return 0;
  }

  let files: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (
        e.isFile() &&
        (e.name.toLowerCase().endsWith(".wav") || e.name.toLowerCase().endsWith(".opus")) &&
        (cli.all || isOurs(e.name))
      )
        files.push(p);
    }
  };
  try {
    walk(cli.dir);
  } catch (e) {
    console.error(`папка недоступна: ${cli.dir} (${e instanceof Error ? e.message : String(e)})`);
    return 1;
  }
  if (cli.filter) files = files.filter((f) => f.includes(cli.filter));
  files = files.toSorted();
  if (files.length === 0) {
    console.error(
      `нет wav в ${cli.dir}${cli.filter ? ` (filter=${cli.filter})` : ""}${cli.all ? "" : " (без --all считаются только наши *__Vox*/*_cfg*)"}`,
    );
    return 1;
  }

  console.log(`выравнивание -16/TP-1.5: ${files.length} wav${cli.dryRun ? " (dry-run)" : ""}`);
  let normed = 0;
  let failed = 0;
  for (const f of files) {
    if (cli.dryRun) {
      console.log(`  ${relative(cli.dir, f)}`);
      normed++;
      continue;
    }
    const isOpus = f.toLowerCase().endsWith(".opus");
    let ok = false;
    if (isOpus) {
      ok = normalizeOpus(f);
    } else {
      const sr = probeRate(f);
      if (sr === null) {
        failed++;
        console.error(`FAIL (не определилась частота): ${relative(cli.dir, f)}`);
        continue;
      }
      ok = normalizeWav(f, sr);
    }
    if (ok) normed++;
    else {
      failed++;
      console.error(`FAIL ${relative(cli.dir, f)}`);
    }
  }
  console.log(`итог: выровнено ${normed}, ошибок ${failed}`);
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
