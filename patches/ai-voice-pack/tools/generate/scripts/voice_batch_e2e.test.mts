/**
 * voice_batch_e2e.test.mts — ЖИВОЙ e2e озвучки (GPU + venv VoxCPM2).
 *
 * В обычную матрицу не входит: skip без флага окружения.
 * Запуск: TSSR_VOICE_E2E=1 node --test .../voice_batch_e2e.test.mts
 *         (или npm run test:voice:e2e)
 *
 * Проверяет канон VoxCPM2: свой шим/venv даёт файл по контракту
 * `{en12}-{state6} {variant}.opus`, звук в норме, --keep-wav кладёт wav рядом.
 * Генерация в режиме --text (демо-uid = md5 текста, арка Demo) — новые файлы
 * после теста удаляются.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { ENGINES, PKG_ROOT, main } from "./voice_batch.mts";

const SKIP = (() => {
  if (process.env.TSSR_VOICE_E2E !== "1") return "TSSR_VOICE_E2E не задан";
  if (!existsSync(ENGINES.voxcpm2.python)) return `нет venv VoxCPM2: ${ENGINES.voxcpm2.python}`;
  if (!existsSync(ENGINES.voxcpm2.shim)) return `нет шима: ${ENGINES.voxcpm2.shim}`;
  return false;
})();

/** Длительность (ffprobe) и средняя громкость (ffmpeg volumedetect). */
function probe(file: string): { dur: number; meanVolume: number } {
  const d = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
    encoding: "utf8",
  });
  const v = spawnSync("ffmpeg", ["-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const mean = /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/.exec(v.stderr)?.[1];
  return { dur: parseFloat(d.stdout), meanVolume: mean === undefined ? NaN : parseFloat(mean) };
}

test("e2e voxcpm2: контрактное имя, звук в норме, --keep-wav кладёт wav рядом", { skip: SKIP }, async () => {
  const text = "Привет! Это проверочный прогон VoxCPM2 — слушаем качество движка.";
  const dir = join(PKG_ROOT, "audio", "ru", "Demo");
  const before = new Set(existsSync(dir) ? readdirSync(dir) : []);
  const created = (): string[] => (existsSync(dir) ? readdirSync(dir).filter((f) => !before.has(f)) : []);
  try {
    const code = await main(["--text", text, "--char", "Sarah", "--lang", "ru", "--keep-wav", "--force"]);
    assert.equal(code, 0, `voice_batch --engine voxcpm2 вернул ${code} (шим упал? смотри batch.log)`);
    const files = created();
    const opus = files.find((f) => f.endsWith(".opus"));
    const wav = files.find((f) => f.endsWith(".wav"));
    assert.ok(opus, `opus не создан в ${dir}`);
    assert.ok(wav, `исходный wav не оставлен рядом с opus (--keep-wav)`);

    const o = probe(join(dir, opus));
    assert.ok(o.dur > 0.3 && o.dur < 20, `подозрительная длительность opus: ${o.dur}s`);
    assert.ok(!Number.isNaN(o.meanVolume) && o.meanVolume > -45, `тихо/пусто: ${o.meanVolume} dB`);
    // wav — валидный контейнер, длительность сходится с opus (конверт не потерял данные)
    const w = probe(join(dir, wav));
    assert.ok(w.dur > 0.3 && w.dur < 20, `подозрительная длительность wav: ${w.dur}s`);
    assert.ok(
      Math.abs(w.dur - o.dur) < 0.3,
      `wav и opus разной длительности: ${w.dur}s vs ${o.dur}s — конверт потерял данные?`,
    );
  } finally {
    for (const f of created()) rmSync(join(dir, f), { force: true });
  }
});
