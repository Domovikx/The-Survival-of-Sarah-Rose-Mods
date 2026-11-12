#!/usr/bin/env node
/** Нелюдские голоса: пресеты orc / demon / monster из человеческого рефа.
 *
 * Порт python beastify.py -> TS (миграция python → .mts, 2026-11-12).
 *
 * ПРИНЦИП (классика VO-озвучки монстров):
 *   - pitch + форманты вниз УМЕРЕННО (asetrate+atempo; 0.84 ≈ -3 полутона,
 *     НЕ октава — иначе «замедленная плёнка»)
 *   - тёмный EQ (bass boost, срез верхов) — «из бочки»
 *   - зерно/хрип (acrusher), компрессия
 *   - СУБ-ТОН: низкий гул (sine 55-75 Гц) с tremolo под голосом — рычание
 *   - демон: дрожащая модуляция + глубокий реверб-гул
 *
 * После цепочки — loudnorm two-pass (-16 LUFS / TP -1.5).
 *
 * ИСПОЛЬЗОВАНИЕ:
 *   node tools/generate/scripts/beastify.mts --file casts/Atilla/Atilla_05.wav
 *   -> рядом Atilla_05_orc.wav, _demon.wav, _monster.wav
 *   node tools/generate/scripts/beastify.mts --file X.wav --only demon
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AUDIO, BEASTIFY } from "./voice_presets.mts";

const SR = Number(AUDIO.sr ?? 24000);
const LOUD_I = Number(AUDIO.loudness?.i ?? -16.0);
const LOUD_TP = Number(AUDIO.loudness?.tp ?? -1.5);
const LOUD_LRA = Number(AUDIO.loudness?.lra ?? 11.0);

export interface BeastPreset {
  k: number;
  chain: string;
  sub_hz?: number;
  sub_vol?: number;
  sub_trem?: number;
}

/** Полная ffmpeg-цепочка голоса: pitch+форманты вниз + тёмный EQ/зерно.
 * Формат строк повторяет python-оригинал (asetrate={sr}*{k} считает ffmpeg). */
export function buildChain(pr: BeastPreset, sr: number): string {
  const pitch = `asetrate=${sr}*${pr.k},aresample=${sr},atempo=${(1 / pr.k).toFixed(5)}`;
  return pitch + "," + pr.chain;
}

/** Двухпроходный loudnorm: сначала замер, потом применение. */
function measure(path: string): Record<string, string> {
  const p = spawnSync(
    "ffmpeg",
    ["-i", path, "-af", `loudnorm=I=${LOUD_I}:TP=${LOUD_TP}:LRA=${LOUD_LRA}:print_format=json`, "-f", "null", "-"],
    { encoding: "utf-8" },
  );
  const m = /\{[\s\S]*\}/.exec(p.stderr ?? "");
  return m ? (JSON.parse(m[0]) as Record<string, string>) : {};
}

function durationSec(path: string): number {
  const out = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], {
    encoding: "utf-8",
  });
  return Number((out.stdout ?? "").trim());
}

function loudnormApply(src: string, dst: string, meas: Record<string, string>): void {
  const args =
    `loudnorm=I=${LOUD_I}:TP=${LOUD_TP}:LRA=${LOUD_LRA}` +
    `:measured_I=${meas.input_i}:measured_TP=${meas.input_tp}` +
    `:measured_LRA=${meas.input_lra}:measured_thresh=${meas.input_thresh}` +
    `:offset=${meas.target_offset}:linear=true`;
  const r = spawnSync("ffmpeg", ["-y", "-i", src, "-af", args, "-ac", "1", "-ar", String(SR), dst], {
    encoding: "utf-8",
  });
  if (r.status !== 0) throw new Error(`ffmpeg loudnorm: exit=${r.status} для ${dst}`);
}

function fmt(v: string | undefined): string {
  return Number(v ?? -99).toFixed(1);
}

function main(): number {
  const argv = process.argv.slice(2);
  const fileIdx = argv.indexOf("--file");
  const onlyIdx = argv.indexOf("--only");
  const src = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : undefined;
  if (!src) {
    console.error("нет обязательного --file <wav>");
    return 1;
  }
  if (!existsSync(src)) {
    console.error("нет файла:", src);
    return 1;
  }
  const stem = src.slice(0, src.length - extname(src).length);
  const d0 = measure(src);
  console.log(`исходник: ${fmt(d0.input_i)} LUFS / TP ${fmt(d0.input_tp)}`);

  for (const name of Object.keys(BEASTIFY).toSorted()) {
    if (only && only !== name) continue;
    const pr = (BEASTIFY as Record<string, BeastPreset>)[name];
    const dur = durationSec(src);
    const tmp = `${stem}_${name}_tmp.wav`;
    const chain = buildChain(pr, SR);
    if ((pr.sub_hz ?? 0) > 0) {
      const sub = `sine=f=${pr.sub_hz}:duration=${dur.toFixed(3)}`;
      const subf = `tremolo=f=${pr.sub_trem ?? 16}:d=0.7,volume=${pr.sub_vol ?? 0.08}`;
      const fc = `[0:a]${chain}[v];[1:a]${subf}[g];[v][g]amix=inputs=2:duration=first:normalize=0[m]`;
      const r = spawnSync(
        "ffmpeg",
        [
          "-y",
          "-i",
          src,
          "-f",
          "lavfi",
          "-i",
          sub,
          "-filter_complex",
          fc,
          "-map",
          "[m]",
          "-ac",
          "1",
          "-ar",
          String(SR),
          tmp,
        ],
        { encoding: "utf-8" },
      );
      if (r.status !== 0) throw new Error(`ffmpeg beast(${name}): exit=${r.status}`);
    } else {
      const r = spawnSync("ffmpeg", ["-y", "-i", src, "-af", chain, "-ac", "1", "-ar", String(SR), tmp], {
        encoding: "utf-8",
      });
      if (r.status !== 0) throw new Error(`ffmpeg beast(${name}): exit=${r.status}`);
    }
    const m = measure(tmp);
    const dst = `${stem}_${name}.wav`;
    loudnormApply(tmp, dst, m);
    rmSync(tmp);
    const d = measure(dst);
    console.log(`${basename(dst)}: ${fmt(d.input_i)} LUFS / TP ${fmt(d.input_tp)}`);
  }
  console.log("готово.");
  return 0;
}

// CLI запускается только напрямую (не при импорте из тестов).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
