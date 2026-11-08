/**
 * Разовый конвертер сиротских wav -> opus (задача владельца 2026-10-30):
 * обход wav-сирот в audio (все *_Vox*.wav), валидация ffprobe, затем ТОТ ЖЕ
 * конвейер, что и
 * в voxcpm_bench.mts: normalizeWav (-16 LUFS/TP-1.5) -> wavToOpus (48k/24k)
 * -> удаление wav. Некорректные (оборванные kill'ом) wav — удаляются,
 * их фразы бенч при следующем resume перегенерирует сам.
 *
 * Запуск: node tmp/convert_orphan_wavs.mts
 */
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeWav, wavToOpus } from "../patches/ai-voice-pack/tools/generate/scripts/voicekit/audio.mts";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const AUDIO = join(REPO, "patches", "ai-voice-pack", "audio");
const VOX_HZ = 48_000;

/** Корректный wav (ffprobe открывает, длительность > 0). */
function wavValid(p: string): boolean {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], {
    encoding: "utf-8",
    timeout: 30_000,
  });
  if (r.status !== 0) return false;
  const d = Number(r.stdout.trim());
  return Number.isFinite(d) && d > 0;
}

function* wavs(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const f of entries) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* wavs(p);
    else if (f.endsWith(".wav")) yield p;
  }
}

let conv = 0;
let bad = 0;
let fail = 0;
for (const p of wavs(AUDIO)) {
  if (!wavValid(p)) {
    console.log(`BROKEN (удаляю, бенч перегенерирует): ${p}`);
    rmSync(p, { force: true });
    bad++;
    continue;
  }
  if (!normalizeWav(p, VOX_HZ)) {
    console.log(`FAIL level: ${p}`);
    fail++;
    continue;
  }
  if (!wavToOpus(p, VOX_HZ)) {
    console.log(`FAIL opus: ${p}`);
    fail++;
    continue;
  }
  rmSync(p, { force: true });
  conv++;
}
console.log(`\nитог: сконвертировано ${conv}, битых удалено ${bad}, ошибок ${fail}`);
process.exit(fail > 0 ? 1 : 0);
