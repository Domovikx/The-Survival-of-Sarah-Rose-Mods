// vox_qc.test.mts — тесты судьи генерируемых wav (метрики, правила, e2e CLI).
// Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/vox_qc.test.mts
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  activeSeconds,
  corpusPathFor,
  envelopeStats,
  f0Stats,
  QC_SR,
  QC_THRESHOLDS,
  type QcMetrics,
  judge,
  parseGeneratedName,
  parseQcCli,
  qcScore,
  scanGenerated,
} from "./vox_qc.mts";
import { measureLoudness } from "./voxcpm_bench.mts";
import { writeWav16 } from "./voicekit/audio.mts";

const HAS_FFMPEG = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const QC_SCRIPT = fileURLToPath(new URL("./vox_qc.mts", import.meta.url));
const UID_A = "a".repeat(32);
const UID_B = "b".repeat(32);

/** Минимальные метрики-«заглушки»: судья поверх точечных значений. */
function fake(partial: Partial<QcMetrics>): QcMetrics {
  return {
    file: "x.wav",
    uid: UID_A,
    voice: "Sarah",
    decoded: true,
    durSec: 3,
    i: -16,
    tp: -3,
    lra: 1,
    crest: 13.5,
    plateauPct: 4,
    flatRun: 1,
    activeSec: 2.5,
    corpusActiveSec: 2.5,
    ratio: 1,
    f0Swing: 11,
    corpusF0Swing: 11,
    f0ShiftSt: 0,
    ...partial,
  };
}

// ------------------------------------------------------------- разбор имён ---

test("parseGeneratedName: только сгенерированные имена, корпус и мусор -> null", () => {
  const gen = parseGeneratedName(`C:/a/ru/Arc/${UID_A}__Sarah__Vox.wav`);
  assert.deepEqual(gen, {
    uid: UID_A,
    voice: "Sarah",
    corpusBase: join("C:/a/ru/Arc", `${UID_A}__Sarah`),
  });
  // матрица/опции: постфиксов много, голос с пробелами
  const matrix = parseGeneratedName(`Arc/${UID_A}__Generic Male Mature__5_cfg2.5_ts30.wav`);
  assert.equal(matrix?.voice, "Generic Male Mature");
  const opt = parseGeneratedName(`Arc/${UID_A}__Sarah__Vox_retry_badcase=false.wav`);
  assert.equal(opt?.voice, "Sarah");
  // корпус ({uid}__{voice}) — не генерация
  assert.equal(parseGeneratedName(`Arc/${UID_A}__Sarah.opus`), null);
  assert.equal(parseGeneratedName(`Arc/${UID_A}__Sarah.wav`), null);
  // мусор: нет uid, короткое имя
  assert.equal(parseGeneratedName("Arc/Sarah.wav"), null);
  assert.equal(parseGeneratedName("Arc/not-a-uid__Sarah__Vox.wav"), null);
});

test("corpusPathFor: рядом .opus, иначе .wav, иначе null", () => {
  const dir = mkdtempSync(join(tmpdir(), "voxqc-corpus-"));
  try {
    const base = join(dir, `${UID_A}__Sarah`);
    assert.equal(corpusPathFor(base), null);
    writeFileSync(base + ".wav", "x");
    assert.equal(corpusPathFor(base), base + ".wav");
    writeFileSync(base + ".opus", "x");
    assert.equal(corpusPathFor(base), base + ".opus", ".opus предпочтительнее .wav");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scanGenerated: обходит дерево и пропускает корпус", () => {
  const dir = mkdtempSync(join(tmpdir(), "voxqc-scan-"));
  try {
    mkdirSync(join(dir, "Arc"));
    writeFileSync(join(dir, "Arc", `${UID_A}__Sarah__Vox.wav`), "x");
    writeFileSync(join(dir, "Arc", `${UID_B}__Kate__2_cfg3_ts10.wav`), "x");
    writeFileSync(join(dir, "Arc", `${UID_A}__Sarah.wav`), "x"); // корпус
    writeFileSync(join(dir, "Arc", "readme.txt"), "x");
    const found = scanGenerated(dir).map((f) => relative(dir, f).replaceAll("\\", "/"));
    assert.deepEqual(found, [`Arc/${UID_A}__Sarah__Vox.wav`, `Arc/${UID_B}__Kate__2_cfg3_ts10.wav`]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ метрики ---

test("activeSeconds: речь активна, тишина — нет", () => {
  const sr = QC_SR;
  const loud = new Int16Array(sr); // секунда синуса ~0.5 FS
  for (let i = 0; i < loud.length; i++) loud[i] = Math.round(16_000 * Math.sin((2 * Math.PI * 220 * i) / sr));
  assert.ok(Math.abs(activeSeconds(loud) - 1) < 0.05, "секунда синуса ~ 1с активности");
  assert.equal(activeSeconds(new Int16Array(sr)), 0, "тишина = 0");
  // пауза в середине не засчитывается
  const half = new Int16Array(sr);
  half.set(loud.subarray(0, sr / 2));
  assert.ok(Math.abs(activeSeconds(half) - 0.5) < 0.05);
});

test("envelopeStats: зажатый сигнал — потолок и длинный флэт, динамичный — нет", () => {
  // «бочка»: квадрат на полной амплитуде — все окна у пика, пики держатся сериями
  const flat = new Int16Array(QC_SR / 2);
  for (let i = 0; i < flat.length; i++) flat[i] = i % 480 < 240 ? 31_000 : -31_000;
  const s1 = envelopeStats(flat);
  assert.ok(s1.plateauPct > 90, `зажатый: потолок ${s1.plateauPct}% > 90`);
  assert.ok(s1.flatRun >= QC_THRESHOLDS.clipRunReject, `зажатый: флэт-серия ${s1.flatRun}`);

  // здоровый: тихий шум с редкими громкими всплесками (2с -> всплеск занимает
  // 1 из 40 окон = 2.5% < порога потолка)
  const dyn = new Int16Array(QC_SR * 2);
  let seed = 42;
  const rnd = (): number => ((seed = (seed * 1_664_525 + 1_013_904_223) >>> 0), seed / 0xffff_ffff);
  for (let i = 0; i < dyn.length; i++) {
    const burst = i > QC_SR / 2 && i < QC_SR / 2 + 2000;
    dyn[i] = Math.round((burst ? 30_000 : 3000) * (rnd() * 2 - 1));
  }
  const s2 = envelopeStats(dyn);
  assert.ok(
    s2.plateauPct < QC_THRESHOLDS.plateauWarn,
    `здоровый: потолок ${s2.plateauPct}% < ${QC_THRESHOLDS.plateauWarn}`,
  );
  assert.equal(s2.flatRun, 1, "здоровый: без серий на экстремуме");
});

// ------------------------------------------------------- правила судьи (unit) ---

test("judge: здоровый файл -> OK без причин", () => {
  const v = judge(fake({}));
  assert.equal(v.level, "OK");
  assert.deepEqual(v.reasons, []);
});

test("judge: не декодируется -> сразу REJECT", () => {
  const v = judge(fake({ decoded: false }));
  assert.equal(v.level, "REJECT");
  assert.match(v.reasons[0], /не декодируется/);
});

test("judge: крест-фактор ниже reject -> REJECT, между reject и warn -> WARN", () => {
  const bad = judge(fake({ crest: QC_THRESHOLDS.crestReject - 0.1 }));
  assert.equal(bad.level, "REJECT");
  assert.match(bad.reasons[0], /крест-фактор/);
  const mid = judge(fake({ crest: QC_THRESHOLDS.crestReject + 0.1 }));
  assert.equal(mid.level, "WARN");
  assert.match(mid.reasons[0], /крест-фактор/);
  assert.equal(judge(fake({ crest: QC_THRESHOLDS.crestWarn })).level, "OK", "на самом пороге warn — ещё OK");
});

test("judge: потолок огибающей — REJECT/WARN по порогам", () => {
  assert.equal(judge(fake({ plateauPct: QC_THRESHOLDS.plateauReject })).level, "REJECT");
  const warn = judge(fake({ plateauPct: QC_THRESHOLDS.plateauWarn }));
  assert.equal(warn.level, "WARN");
  assert.match(warn.reasons[0], /потолок/);
  assert.equal(judge(fake({ plateauPct: QC_THRESHOLDS.plateauWarn - 1 })).level, "OK");
});

test("judge: клиппинг (серия на экстремуме) -> REJECT", () => {
  const v = judge(fake({ flatRun: QC_THRESHOLDS.clipRunReject }));
  assert.equal(v.level, "REJECT");
  assert.match(v.reasons[0], /клиппинг/);
  assert.equal(judge(fake({ flatRun: QC_THRESHOLDS.clipRunReject - 1 })).level, "OK");
});

test("judge: F0 — свинг к корпусу и сдвиг регистра (класс Atilla/maniac)", () => {
  // свинг: дельта >= 14 -> REJECT (Atilla 31.5 vs 6.2), >= 8 -> WARN, меньше -> OK
  const bad = judge(fake({ f0Swing: 20, corpusF0Swing: 6 }));
  assert.equal(bad.level, "REJECT");
  assert.match(bad.reasons[0], /F0-свинг/);
  const warn = judge(fake({ f0Swing: 15, corpusF0Swing: 7 }));
  assert.equal(warn.level, "WARN");
  assert.equal(judge(fake({ f0Swing: 13, corpusF0Swing: 6 })).level, "OK", "Δ7 — ещё норма");
  // регистр: |сдвиг| >= 10 -> REJECT (Warrior +27.9), >= 6 -> WARN
  const shiftBad = judge(fake({ f0ShiftSt: 27.9 }));
  assert.equal(shiftBad.level, "REJECT");
  assert.match(shiftBad.reasons[0], /регистр F0/);
  assert.equal(judge(fake({ f0ShiftSt: -11 })).level, "REJECT", "отрицательный сдвиг тоже");
  assert.equal(judge(fake({ f0ShiftSt: 6 })).level, "WARN");
  assert.equal(judge(fake({ f0ShiftSt: 5.9 })).level, "OK");
  // нет корпусного F0 (корпус не озвучен) — правила молчат
  assert.equal(judge(fake({ f0Swing: 31, corpusF0Swing: null })).level, "OK");
});

test("judge: длительность к корпусу — reject далеко, warn рядом, без эталона не проверяется", () => {
  assert.equal(judge(fake({ ratio: 3 })).level, "REJECT");
  assert.equal(judge(fake({ ratio: 0.2 })).level, "REJECT");
  const warn = judge(fake({ ratio: 2 }));
  assert.equal(warn.level, "WARN");
  assert.match(warn.reasons[0], /длительность/);
  assert.equal(judge(fake({ ratio: 1 })).level, "OK");
  assert.equal(judge(fake({ ratio: null, corpusActiveSec: null })).level, "OK", "нет корпуса -> правила нет");
  // микро-корпус (< 1с активности): ratio нестабилен, правило молчит
  // (реальный кейс: Orc "You! Come!" — корпус 0.34с, генерация 2.34с = 6.9x
  // ложного REJECT'а, файл норм по владельцу 2026-10-27)
  const micro = judge(fake({ ratio: 6.9, corpusActiveSec: 0.34 }));
  assert.equal(micro.level, "OK", `микро-корпус -> ratio не проверяется: ${micro.reasons.join("; ")}`);
  // ровно на пороге применимости — правило уже работает
  assert.equal(judge(fake({ ratio: 3, corpusActiveSec: QC_THRESHOLDS.ratioMinCorpusSec })).level, "REJECT");
});

test("judge: несколько дефектов -> REJECT с полным списком причин (reject первыми)", () => {
  const v = judge(fake({ crest: 9.7, plateauPct: 44, flatRun: 10, ratio: 0.1 }));
  assert.equal(v.level, "REJECT");
  assert.equal(v.reasons.length, 4);
  assert.match(v.reasons[0], /крест-фактор/);
  assert.match(v.reasons[1], /потолок/);
  assert.match(v.reasons[2], /клиппинг/);
  assert.match(v.reasons[3], /длительность/);
});

test("f0Stats: синус -> медиана ≈ частоте и малый свинг; тишина/шум -> null", () => {
  const n = 16_000; // секунда на F0_SR
  const sine = new Int16Array(n);
  for (let i = 0; i < n; i++) sine[i] = Math.round(0.4 * 32_767 * Math.sin((2 * Math.PI * 150 * i) / 16_000));
  const r = f0Stats(sine);
  assert.ok(r, "сигнал озвучен");
  assert.ok(Math.abs(r.med - 150) < 10, `медиана ~150 Гц, got ${r.med}`);
  assert.ok(r.swing < 6, `чистый синус почти без свинга, got ${r.swing}`);
  // тишина и немодулированный шум — не озвученные кадры (voicing-фильтр)
  assert.equal(f0Stats(new Int16Array(n)), null, "тишина -> null");
  const noise = new Int16Array(n);
  let seed = 42;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    noise[i] = Math.round(((seed / 0xffff_ffff) * 2 - 1) * 0.4 * 32_767);
  }
  assert.equal(f0Stats(noise), null, "шум без периодичности -> null");
});

test("qcScore: REJECT -> null; дефекты (в т.ч. F0-свинг «маньяка») растят штраф", () => {
  const s0 = qcScore(fake({}));
  assert.ok(s0 !== null, "здоровый файл штрафуется");
  assert.ok(s0 < 1, `здоровый близок к 0, got ${s0}`);
  const up = (m: Partial<QcMetrics>): number => qcScore(fake(m)) ?? 999;
  assert.ok(up({ crest: 11.5 }) > s0, "crest к REJECT -> хуже");
  assert.ok(up({ plateauPct: 28 }) > s0, "потолок -> хуже");
  assert.ok(up({ ratio: 1.7 }) > s0, "длительность -> хуже");
  // «маньяк» Thomas (реальные числа): свинг 19.8 при корпусных 11.3, сдвиг -5.6ст
  assert.ok(up({ f0Swing: 19.8, corpusF0Swing: 11.3, f0ShiftSt: -5.6 }) > s0, "F0-девиация -> хуже");
  assert.equal(qcScore(fake({ crest: 10 })), null, "REJECT не участвует в отборе");
});

// ------------------------------------------------------------------ CLI ---

test("parseQcCli: опции, дефолтный --dir из --lang, неизвестная опция = стоп", () => {
  const def = parseQcCli([]);
  assert.ok(def.dir.endsWith("ru"), `дефолтный --dir из lang: ${def.dir}`);
  assert.equal(def.all, false);
  assert.equal(def.rank, false, "--rank выключен по умолчанию");
  assert.equal(def.pick, false, "--pick выключен по умолчанию");
  const o = parseQcCli([
    "--dir",
    "D:/x",
    "--filter",
    "J",
    "--json",
    "r.json",
    "--rejects",
    "rej.txt",
    "--rank",
    "--pick",
    "--promote",
    "--archive",
    "D:/arch",
    "--normalize",
    "--all",
  ]);
  assert.equal(o.dir, "D:/x");
  assert.equal(o.filter, "J");
  assert.equal(o.json, "r.json");
  assert.equal(o.rejects, "rej.txt");
  assert.equal(o.rank, true);
  assert.equal(o.pick, true);
  assert.equal(o.promote, true);
  assert.equal(o.archive, "D:/arch");
  assert.equal(o.normalize, true, "--normalize включён");
  assert.equal(o.all, true);
  assert.equal(parseQcCli([]).normalize, false, "без флага фильтр не применяется");
  assert.match(parseQcCli([]).archive, /tmp.*voxcpm_bench.*rejected/, "архив по умолчанию в tmp");
  assert.throws(() => parseQcCli(["--nope"]), /неизвестная опция/);
  assert.throws(() => parseQcCli(["--dir"]), /нет значения/);
});

// -------------------------------------------------------------- e2e CLI ---

/**
 * E2E: две синтетические фразы (uid__voice__Vox.wav) — здоровая и «бочка»
 * (зажатый синус), запуск vox_qc.mts как процесса: exit 1, REJECT у брака,
 * отсутствие REJECT у здоровой, JSON-отчёт содержит обе строки.
 */
test("e2e: CLI судит синтетические wav (брак REJECT, здоровый не REJECT)", { skip: !HAS_FFMPEG }, () => {
  const dir = mkdtempSync(join(tmpdir(), "voxqc-e2e-"));
  try {
    mkdirSync(join(dir, "Arc"));
    // здоровая: динамичный сигнал (всплески на тихом фоне)
    const good = new Float32Array(QC_SR * 2);
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1_664_525 + 1_013_904_223) >>> 0), seed / 0xffff_ffff);
    for (let i = 0; i < good.length; i++) {
      const burst = i % QC_SR > QC_SR / 2 && i % QC_SR < QC_SR / 2 + 1500;
      good[i] = (burst ? 0.9 : 0.08) * (rnd() * 2 - 1);
    }
    writeWav16(join(dir, "Arc", `${UID_A}__Sarah__Vox.wav`), good, QC_SR);
    // брук: зажатый синус на полной амплитуде — «бочка» владельца
    const bad = new Float32Array(QC_SR);
    for (let i = 0; i < bad.length; i++) bad[i] = 0.999 * Math.sin((2 * Math.PI * 60 * i) / QC_SR);
    writeWav16(join(dir, "Arc", `${UID_B}__Kate__Vox.wav`), bad, QC_SR);
    const json = join(dir, "qc.json");
    const rejects = join(dir, "rejects.txt");

    const r = spawnSync(process.execPath, [QC_SCRIPT, "--dir", dir, "--json", json, "--rejects", rejects], {
      encoding: "utf8",
      timeout: 120_000,
      windowsHide: true,
    });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    assert.equal(r.status, 1, `exit 1 при наличии брака; output:\n${out}`);
    assert.match(out, /1 REJECT/, `сводка считает REJECT; output:\n${out}`);
    assert.ok(out.includes(`${UID_B}__Kate__Vox.wav`), `брак назван по имени; output:\n${out}`);
    // здоровый файл НЕ в списке REJECT (список после итога)
    const rejectList = out.split("=== ИТОГ")[1] ?? "";
    assert.ok(!rejectList.includes(UID_A), `здоровый не в списке брака; output:\n${out}`);
    // JSON-отчёт: обе строки с вердиктами
    const rows = readFileSync(json, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.equal(rows.length, 2);
    const byUid = new Map(rows.map((r2) => [r2.uid, r2]));
    assert.notEqual(
      byUid.get(UID_A)?.verdict?.level,
      "REJECT",
      `здоровый не REJECT: ${JSON.stringify(byUid.get(UID_A)?.verdict)}`,
    );
    assert.equal(byUid.get(UID_B)?.verdict?.level, "REJECT");
    assert.match(byUid.get(UID_B)?.verdict?.reasons?.[0] ?? "", /крест-фактор|потолок/);
    // --rejects: только фразы брака в формате "arc/uid__voice на строку"
    // (еда --uids @файл)
    assert.equal(readFileSync(rejects, "utf8"), `Arc/${UID_B}__Kate\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("e2e: пустая папка -> exit 1 с понятной ошибкой", { skip: !HAS_FFMPEG }, () => {
  const dir = mkdtempSync(join(tmpdir(), "voxqc-empty-"));
  try {
    const r = spawnSync(process.execPath, [QC_SCRIPT, "--dir", dir], {
      encoding: "utf8",
      timeout: 60_000,
      windowsHide: true,
    });
    assert.equal(r.status, 1);
    assert.match(`${r.stdout}${r.stderr}`, /нет сгенерированных wav/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * E2E промоута: два кандидата _s{seed} одной фразы — здоровый (динамичный)
 * и «бочка» (зажатый квадрат, REJECT). --promote обязан: каноническое имя
 * получить здорового (байт-в-байт), обоих кандидатов убрать в архив
 * (--archive), REJECT-кандидата не промоутить.
 */
test("e2e: --promote кладёт лучшего в каноническое имя, кандидатов архивирует", { skip: !HAS_FFMPEG }, () => {
  const dir = mkdtempSync(join(tmpdir(), "voxqc-promote-"));
  try {
    mkdirSync(join(dir, "Arc"));
    // здоровый: динамичный сигнал (всплески на тихом фоне)
    const good = new Float32Array(QC_SR * 2);
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1_664_525 + 1_013_904_223) >>> 0), seed / 0xffff_ffff);
    for (let i = 0; i < good.length; i++) {
      const burst = i % QC_SR > QC_SR / 2 && i % QC_SR < QC_SR / 2 + 1500;
      good[i] = (burst ? 0.9 : 0.08) * (rnd() * 2 - 1);
    }
    // брак: зажатый квадрат -> REJECT (потолок + клиппинг-серия)
    const bad = new Float32Array(QC_SR);
    for (let i = 0; i < bad.length; i++) bad[i] = i % 480 < 240 ? 0.999 : -0.999;

    const goodPath = join(dir, "Arc", `${UID_A}__Sarah__Vox_s7.wav`);
    const badPath = join(dir, "Arc", `${UID_A}__Sarah__Vox_s42.wav`);
    const canon = join(dir, "Arc", `${UID_A}__Sarah__Vox.wav`);
    writeWav16(goodPath, good, QC_SR);
    writeWav16(badPath, bad, QC_SR);
    const goodBytes = readFileSync(goodPath);
    const arch = join(dir, "arch");

    const r = spawnSync(process.execPath, [QC_SCRIPT, "--dir", dir, "--archive", arch, "--promote", "--pick"], {
      encoding: "utf8",
      timeout: 120_000,
      windowsHide: true,
    });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    // exit 1: в прогоне был REJECT (бракованный кандидат) — но он НЕ промоутился
    assert.equal(r.status, 1, `exit при наличии REJECT; output:\n${out}`);
    assert.match(out, /промоут итог: 1 канонических/, `1 промоут; output:\n${out}`);
    // канонический = здоровый кандидат, байт-в-байт
    assert.ok(readFileSync(canon).equals(goodBytes), "каноническое имя = победитель байт-в-байт");
    // оба кандидата убраны из корпуса в архив (подпапка = арка)
    assert.ok(!existsSync(goodPath) && !existsSync(badPath), "кандидатов в корпусе не осталось");
    assert.ok(existsSync(join(arch, "Arc", `${UID_A}__Sarah__Vox_s7.wav`)), "победитель в архиве (копия)");
    assert.ok(existsSync(join(arch, "Arc", `${UID_A}__Sarah__Vox_s42.wav`)), "брак в архиве");
    // --pick отдал путь канонического (победитель после промоута)
    const pick = out.split("=== PICK ===")[1] ?? "";
    assert.ok(pick.includes(`${UID_A}__Sarah__Vox.wav`), `pick указывает на канонический; output:\n${out}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * E2E политики «фильтр только после судьи» (владелец 2026-10-27): --normalize
 * выравнивает (-16/TP-1.5) ровно ОДОБРЁННЫЙ файл и НЕ трогает REJECT
 * (байт-в-байт), вердикты при этом считаются по СЫРОМУ звуку.
 */
test("e2e: --normalize выравнивает одобренный и не трогает отклонённый", { skip: !HAS_FFMPEG }, () => {
  const dir = mkdtempSync(join(tmpdir(), "voxqc-norm-"));
  try {
    mkdirSync(join(dir, "Arc"));
    // одобряемый: тихий динамичный сигнал (сырой уровень далеко от -16,
    // crest ~13 дБ — реалистично для Vox; спайковость >14.5 дБ физически
    // недостижима в тунеле при TP -1.5 без компрессии — вне контракта)
    const good = new Float32Array(QC_SR * 4);
    let seed = 11;
    const rnd = (): number => ((seed = (seed * 1_664_525 + 1_013_904_223) >>> 0), seed / 0xffff_ffff);
    for (let i = 0; i < good.length; i++) {
      const burst = i % QC_SR > QC_SR / 2 && i % QC_SR < QC_SR / 2 + 1500;
      good[i] = (burst ? 0.12 : 0.04) * (rnd() * 2 - 1);
    }
    const goodPath = join(dir, "Arc", `${UID_A}__Sarah__Vox_cfg2.6.wav`);
    writeWav16(goodPath, good, QC_SR);
    // отклоняемый: зажатый квадрат -> REJECT
    const bad = new Float32Array(QC_SR);
    for (let i = 0; i < bad.length; i++) bad[i] = i % 480 < 240 ? 0.999 : -0.999;
    const badPath = join(dir, "Arc", `${UID_B}__Kate__Vox_cfg2.6.wav`);
    writeWav16(badPath, bad, QC_SR);
    const badBytes = readFileSync(badPath);

    const r = spawnSync(process.execPath, [QC_SCRIPT, "--dir", dir, "--normalize"], {
      encoding: "utf8",
      timeout: 180_000,
      windowsHide: true,
    });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    assert.equal(r.status, 1, `REJECT даёт exit 1; output:\n${out}`);
    assert.match(out, /уровень выровнен после одобрения: 1 \(не выровнялось: 0\)/, `счётчик; output:\n${out}`);

    const l = measureLoudness(goodPath);
    if (!l || l.i === null) assert.fail("замер одобренного не прошёл");
    assert.ok(Math.abs(l.i + 16) <= 0.7, `одобренный выровнен: I=${l.i} (ждём -16 ±0.7)`);
    assert.ok(l.tp !== null && l.tp <= -1.4, `TP=${l.tp}`);
    assert.ok(readFileSync(badPath).equals(badBytes), "отклонённый НЕ тронут (байт-в-байт)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
