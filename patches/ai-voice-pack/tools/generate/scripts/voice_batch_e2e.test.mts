/**
 * voice_batch_e2e.test.mts — ЖИВОЙ e2e озвучки (GPU + venv CosyVoice).
 *
 * В обычную матрицу не входит: skip без флага окружения.
 * Запуск: TSSR_VOICE_E2E=1 node --test .../voice_batch_e2e.test.mts
 *         (или npm run test:voice:e2e)
 *
 * Ловит регрессии прогона 2026-10-23:
 *   1) мохибаку — прямые запуски без PYTHONIOENCODING: сверяем, что шим
 *      эхнул русский текст в UTF-8 («synthesis text Привет...» в batch.log);
 *   2) гонку фронтенда wetext — ПЕРВАЯ строка после загрузки модели должна
 *      генерироваться (падение = код 1 от voice_batch / нет файла);
 *   3) runaway-длительность и цифровую тишину на выходе.
 *
 * Генерация в режиме --text (демо-uid = md5 текста, арка Demo) — файл после
 * теста удаляется.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { DEFAULT_PYTHON, PKG_ROOT, main } from "./voice_batch.mts";

const SKIP = (() => {
  if (process.env.TSSR_VOICE_E2E !== "1") return "TSSR_VOICE_E2E не задан";
  if (!existsSync(DEFAULT_PYTHON)) return `нет venv CosyVoice: ${DEFAULT_PYTHON}`;
  return false;
})();

const BATCH_LOG = join(PKG_ROOT, "tools", "generate", "output", "voice", "batch.log");

interface Probe {
  dur: number;
  meanVolume: number;
}

/** Длительность (ffprobe) и средняя громкость (ffmpeg volumedetect). */
function probe(file: string): Probe {
  const d = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
    encoding: "utf8",
  });
  const v = spawnSync("ffmpeg", ["-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const mean = /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/.exec(v.stderr)?.[1];
  return { dur: parseFloat(d.stdout), meanVolume: mean === undefined ? NaN : parseFloat(mean) };
}

async function runDemo(text: string, lang: "ru" | "en"): Promise<string> {
  const uid = createHash("md5").update(text, "utf8").digest("hex");
  const opus = join(PKG_ROOT, "audio", `vo_${lang}`, "Demo", `${uid}__Sarah.opus`);
  try {
    const code = await main(["--text", text, "--char", "Sarah", "--lang", lang, "--force"]);
    assert.equal(code, 0, `voice_batch вернул ${code} (первая строка после загрузки модели упала?)`);
    assert.ok(existsSync(opus), `файл не создан: ${opus}`);
    return opus;
  } catch (e) {
    rmSync(opus, { force: true });
    rmSync(opus.replace(/\.opus$/, ".wav"), { force: true });
    throw e;
  }
}

/** Общие проверки выхода + эхо-лог шима (только для ru — текст кириллический). */
function checkOutput(opus: string, text: string, lang: "ru" | "en"): void {
  const { dur, meanVolume } = probe(opus);
  assert.ok(dur > 0.3 && dur < 20, `подозрительная длительность: ${dur}s (runaway?)`);
  assert.ok(!Number.isNaN(meanVolume) && meanVolume > -45, `тихо/пусто: mean_volume=${meanVolume} dB`);
  if (lang === "ru") {
    const log = readFileSync(BATCH_LOG, "utf8");
    // Эхо шима: строка «INFO synthesis text <CV3-префикс><текст>» — ключевой
    // маркер — «synthesis text» (пишет только python) плюс сам текст в UTF-8.
    const echoed = log.split(/\r?\n/).some((l) => l.includes("synthesis text ") && l.includes(text));
    assert.ok(echoed, "мохибака: шим не эхнул текст в UTF-8 (sys.stdin.reconfigure в cosyworker.py?)");
  }
}

test("e2e ru: первая после загрузки — без TextEncodeInput, текст в UTF-8, звук в норме", { skip: SKIP }, async () => {
  const text = "Привет! Это проверочный прогон озвучки — слушаем качество звука.";
  const opus = await runDemo(text, "ru");
  try {
    checkOutput(opus, text, "ru");
  } finally {
    rmSync(opus, { force: true });
  }
});

test("e2e en: второй язык — файл создаётся, длительность и громкость в норме", { skip: SKIP }, async () => {
  const text = "Hello! This is a voice generation check — listening for the sound quality.";
  const opus = await runDemo(text, "en");
  try {
    checkOutput(opus, text, "en");
  } finally {
    rmSync(opus, { force: true });
  }
});
