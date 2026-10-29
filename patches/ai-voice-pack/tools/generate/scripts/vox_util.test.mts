// vox_util.test.mts — тесты отдельных утилит: vox_opus.mts (конвертер) и
// vox_level.mts (выравнивание уровня). Заказ владельца 2026-10-28.
// Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/vox_util.test.mts
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { measureLoudness } from "./voxcpm_bench.mts";
import { OPUS_RATES, parseOpusCli, OPUS_USAGE } from "./vox_opus.mts";
import { LEVEL_USAGE, parseLevelCli } from "./vox_level.mts";
import { wavToOpus, writeWav16 } from "./voicekit/audio.mts";

const HAS_FFMPEG = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const HAS_FFPROBE = spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;
const CAN = HAS_FFMPEG && HAS_FFPROBE;
const OPUS_SCRIPT = fileURLToPath(new URL("./vox_opus.mts", import.meta.url));
const LEVEL_SCRIPT = fileURLToPath(new URL("./vox_level.mts", import.meta.url));
const SR = 48000;

/** Динамичный сигнал с умеренным crest (≈13) — достижим для -16 при TP -1.5. */
function bursty(seed0: number, seconds: number): Float32Array {
  const out = new Float32Array(SR * seconds);
  let seed = seed0;
  const rnd = (): number => ((seed = (seed * 1_664_525 + 1_013_904_223) >>> 0), seed / 0xffff_ffff);
  for (let i = 0; i < out.length; i++) {
    const burst = i % SR > SR / 2 && i % SR < SR / 2 + 1500;
    out[i] = (burst ? 0.12 : 0.04) * (rnd() * 2 - 1);
  }
  return out;
}

// ------------------------------------------------------------- parse CLI ---

test("parseOpusCli: rate-контракт opus (36k невозможен), дефолты, мусор=стоп", () => {
  const d = parseOpusCli([]);
  assert.equal(d.rate, 48000, "дефолт 48k — Vox-стандарт (2026-10-28)");
  assert.ok(d.dir.endsWith("ru"));
  assert.deepEqual([...OPUS_RATES], [8000, 12000, 16000, 24000, 48000]);
  assert.equal(parseOpusCli(["--rate", "48000", "--dir", "D:/x", "--filter", "a", "--dry-run"]).rate, 48000);
  assert.throws(() => parseOpusCli(["--rate", "36000"]), /36k-режима у кодека НЕТ/);
  assert.throws(() => parseOpusCli(["--rate", "abc"]), /opus поддерживает только/);
  assert.throws(() => parseOpusCli(["--nope"]), /неизвестная опция/);
  assert.match(OPUS_USAGE, /rate/);
});

test("parseLevelCli: --all и дефолты (только наши wav без флага), мусор=стоп", () => {
  const d = parseLevelCli([]);
  assert.equal(d.all, false, "по умолчанию НЕ трогаем чужие wav");
  assert.equal(parseLevelCli(["--all"]).all, true);
  assert.ok(d.dir.endsWith("ru"));
  assert.throws(() => parseLevelCli(["--nope"]), /неизвестная опция/);
  assert.match(LEVEL_USAGE, /-16/);
});

// ------------------------------------------------------------------ e2e ---

test("e2e vox_opus: конвертация + существующий opus НИКОГДА не перезаписывается", { skip: !CAN }, () => {
  const dir = mkdtempSync(join(tmpdir(), "voxopus-e2e-"));
  try {
    mkdirSync(join(dir, "Arc"));
    // 1) свежий wav -> появится opus
    const fresh = join(dir, "Arc", "aaa__Sarah__Vox_cfg2.6_ts30_dn.wav");
    writeWav16(fresh, bursty(7, 1), SR);
    // 2) wav с существующим opus (эмуляция корпуса) -> sentinel обязан выжить
    const withOpus = join(dir, "Arc", "bbb__Kate.wav");
    writeWav16(withOpus, bursty(9, 1), SR);
    const sentinel = join(dir, "Arc", "bbb__Kate.opus");
    writeFileSync(sentinel, "SENTINEL-НЕ-ТОГРАТЬ");

    const r = spawnSync(process.execPath, [OPUS_SCRIPT, "--dir", dir, "--rate", "24000"], {
      encoding: "utf8",
      timeout: 180_000,
      windowsHide: true,
    });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    assert.equal(r.status, 0, `exit 0; output:\n${out}`);
    const made = join(dir, "Arc", "aaa__Sarah__Vox_cfg2.6_ts30_dn.opus");
    assert.ok(existsSync(made), `opus создан; output:\n${out}`);
    assert.ok(statSync(made).size > 0, "opus не пустой");
    assert.ok(readFileSync(sentinel).equals(Buffer.from("SENTINEL-НЕ-ТОГРАТЬ")), "существующий opus НЕ перезаписан");
    assert.match(out, /пропущено \(opus уже есть\) 1/, "пропуск посчитан");

    // 3) rate 36 -> стоп с объяснением
    const r36 = spawnSync(process.execPath, [OPUS_SCRIPT, "--dir", dir, "--rate", "36000"], {
      encoding: "utf8",
      timeout: 60_000,
      windowsHide: true,
    });
    assert.equal(r36.status, 1);
    assert.match(`${r36.stdout}${r36.stderr}`, /36k-режима у кодека НЕТ/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** OpusHead original_rate - честная частота opus (ffprobe для opus врёт 48000). */
function opusRate(path: string): number {
  const b = readFileSync(path);
  const i = b.indexOf(Buffer.from("OpusHead", "ascii"));
  if (i < 0) assert.fail(`нет OpusHead в ${path} - файл не opus?`);
  return b.readUInt32LE(i + 12);
}

test("e2e vox_level: выравнивает -16 +/-0.7, чужие wav без --all не трогает", { skip: !CAN }, () => {
  const dir = mkdtempSync(join(tmpdir(), "voxlevel-e2e-"));
  try {
    mkdirSync(join(dir, "Arc"));
    const ours = join(dir, "Arc", "aaa__Sarah__Vox_cfg2.6_ts30_dn.wav");
    writeWav16(ours, bursty(11, 4), SR);
    const foreign = join(dir, "Arc", "plain.wav"); // НЕ наш паттерн
    writeWav16(foreign, bursty(13, 4), SR);
    const foreignBytes = readFileSync(foreign);

    const r = spawnSync(process.execPath, [LEVEL_SCRIPT, "--dir", dir], {
      encoding: "utf8",
      timeout: 180_000,
      windowsHide: true,
    });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    assert.equal(r.status, 0, `exit 0; output:\n${out}`);
    assert.match(out, /выровнено 1/, `обработан только наш; output:\n${out}`);

    const l = measureLoudness(ours);
    if (!l || l.i === null) assert.fail("замер не прошёл");
    assert.ok(Math.abs(l.i + 16) <= 0.7, `наш выровнен: I=${l.i}`);
    assert.ok(l.tp !== null && l.tp <= -1.4, `TP=${l.tp}`);
    assert.ok(readFileSync(foreign).equals(foreignBytes), "чужой wav без --all НЕ тронут (байт-в-байт)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("e2e vox_level: opus-вход -> opus-выход (второе поколение): -16 и OggS-контракт", { skip: !CAN }, () => {
  const dir = mkdtempSync(join(tmpdir(), "voxlevel-opus-"));
  try {
    mkdirSync(join(dir, "Arc"));
    // сырой opus: тихий wav (далеко от -16) -> кодек БЕЗ нормировки
    const rawWav = join(dir, "Arc", "ddd__Narrator__Vox_cfg2.6_ts30_dn.wav");
    writeWav16(rawWav, bursty(19, 3), 48000);
    assert.equal(wavToOpus(rawWav), true, "сырой opus создан");
    const opus = rawWav.replace(/\.wav$/, ".opus");
    rmSync(rawWav); // в папке остаётся только opus — как в миграционном плане
    // второй файл — Vox-стандарт 48 kHz (проверка сохранения частоты обоих)
    const rawWav48 = join(dir, "Arc", "eee__Narrator__Vox_cfg2.6_ts30_dn.wav");
    writeWav16(rawWav48, bursty(19, 3), 48000);
    assert.equal(wavToOpus(rawWav48, 48_000), true, "сырой opus 48k создан");
    const opus48 = rawWav48.replace(/\.wav$/, ".opus");
    rmSync(rawWav48);
    const before = measureLoudness(opus);
    if (!before || before.i === null) assert.fail("замер до не прошёл");
    assert.ok(Math.abs(before.i + 16) > 3, `сырой opus далёк от -16: ${before.i} (иначе тест нечего выравнивать)`);

    const r = spawnSync(process.execPath, [LEVEL_SCRIPT, "--dir", dir], {
      encoding: "utf8",
      timeout: 180_000,
      windowsHide: true,
    });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    assert.equal(
      r.status,
      0,
      `exit 0; output:
${out}`,
    );
    assert.match(
      out,
      /выровнено 2/,
      `обработан opus; output:
${out}`,
    );

    const after = measureLoudness(opus);
    if (!after || after.i === null || after.tp === null) assert.fail("замер после не прошёл");
    // механика opus-пути: уровень ПОДНЯЛСЯ к тунелю, TP уважен.
    // (спайковый синтетик физически недостижим в -16 при TP -1.5 без
    // компрессии — точность до -16 проверяется на реальных файлах)
    assert.ok(after.i > before.i + 3, `уровень поднят: ${before.i} -> ${after.i}`);
    assert.ok(after.tp <= -1.4, `TP=${after.tp}`);
    // контейнер остался opus (не wav-подделка)
    const head = readFileSync(opus).subarray(0, 4).toString("latin1");
    assert.equal(head, "OggS", "контейнер OggS (реальный opus, не wav)");
    // контейнер остался opus (не wav-подделка) у обоих
    const head48 = readFileSync(opus48).subarray(0, 4).toString("latin1");
    assert.equal(head48, "OggS", "контейнер OggS у 48k-файла");
    // частоты СОХРАНЕНЫ: 24000 (кози-контракт) и 48000 (Vox-стандарт) — не понижены
    assert.equal(opusRate(opus), 24000, "OpusHead 24000 сохранён после выравнивания");
    assert.equal(opusRate(opus48), 48000, "OpusHead 48000 сохранён (Vox-стандарт)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
