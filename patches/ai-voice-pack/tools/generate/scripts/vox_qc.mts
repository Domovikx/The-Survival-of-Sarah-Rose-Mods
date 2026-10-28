/**
 * vox_qc.mts — СУДЬЯ на выходе генерируемых wav: ловит брак до прослушивания.
 *
 * !!! ВРЕМЕННО ОТКЛЮЧЁН В ПАЙПЛАЙНЕ (вердикт владельца 2026-10-27): пороги
 * перестали соответствовать кейсам — файл 4fd22a4c__Atilla__Vox_cfg2.0_ts50
 * судья браковал, владелец послушал: «вполне зачётно звучит». Новый конфиг
 * (cfg2.0/ts50) меняет звучание настолько, что калибровка 2.6-эры (crest/
 * потолок/F0) устарела. Код и CLI сохранены; до новой калибровки судья в
 * цикл НЕ вызывается (флаги работают, тесты зелёные).
 *
 * Задача (владелец, 2026-10-27): «нам нужен судья на выходе генерируемых WAV» —
 * после по-голосового прогона 213 файлов часть звучит «как в бочке» (шум,
 * приглушённый спектр, огибающая упирается в потолок «и пытается за пределы
 * уйти»). Слушать 200+ файлов вручную нереально -> автоматический отсев.
 *
 * ДИАГНОСТИКА (замеры 2026-10-27, ручная проверка владельцем):
 *   брак = низкий крест-фактор (TP-I) + высокая доля окон, упирающихся в
 *   общий пик; здоровый файл (корпус Cosy и нормальные Vox) держит
 *   crest >= 13 и потолок единицы процентов (корпус 3-4%). Клиппинг
 *   (серии семплов на экстремуме) и расхождение активной длительности
 *   с корпусом — отдельные классы.
 *
 * КЛАССЫ (QC_THRESHOLDS — единый источник порогов, откалиброван на слушаниях;
 * потолок ужесточён владельцем 2026-10-27 после пилота: принял ухом 7-13%,
 * отверг 27% — REJECT встал на 15%, WARN на 10%):
 *   REJECT — брак:    crest < 11 | потолок >= 15% окон | клиппинг-сериал
 *                     | расхождение длительности с корпусом x0.7..2.5 (корпус >= 1с)
 *                     | файл не декодируется
 *   WARN   — подозр.: crest < 12 | потолок >= 10% | длительность x0.85..1.8
 *   OK               — ничего из вышеперечисленного
 *
 * ЗАПУСК (из корня репы):
 *   node patches/ai-voice-pack/tools/generate/scripts/vox_qc.mts                # весь vo_ru
 *   node .../vox_qc.mts --filter Jasmine --all                                  # строки всех вердиктов
 *   node .../vox_qc.mts --lang ru --json tmp/voxcpm_bench/qc.json               # отчёт JSON
 *   node .../vox_qc.mts --rejects tmp/voxcpm_bench/rejects.txt                  # фразы брака
 *   node .../vox_qc.mts --dir tmp/voxcpm_bench/rejected                         # произвольная папка
 *
 * ЦИКЛ ЛЕЧЕНИЯ БРАКА (замкнут 2026-10-27):
 *   генерация СЫРАЯ (без фильтров, voxcpm_bench) ->
 *   node .../vox_qc.mts --rejects tmp/voxcpm_bench/rejects.txt   # судья выгружает брак
 *   node .../vox_qc.mts --normalize                              # уровень только на ОДОБРЁННЫХ
 *   node .../voxcpm_bench.mts --uids @tmp/voxcpm_bench/rejects.txt --seed 42  # перегенерация
 *   node .../vox_qc.mts --normalize                              # снова судья (итерация)
 *
 * Exit code: 1, если есть хотя бы один REJECT (CI/пульт-дружелюбно).
 * Корпусные файлы `{uid}__{voice}.opus|.wav` судья НЕ трогает (без третьей
 * части в имени) — QC применяется только к сгенерированным (`__Vox`,
 * `__N_cfg…`, `__Vox_key=value`).
 *
 * Метрики: decode ffmpeg (48k mono s16) + loudnorm-замер (measureLoudness
 * из voxcpm_bench — DRY) + чистый TS-расчёт огибающей/активности/клиппинга.
 * Активная длительность сравнивается с корпусным эталоном той же фразы, если
 * он есть рядом.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { type Loudness, measureLoudness } from "./voxcpm_bench.mts";
import { PKG_ROOT } from "./voice_batch.mts";
import { normalizeWav } from "./voicekit/audio.mts";

/** Частота декодирования: нативная VoxCPM2 (и opus-корпус сюда поднимается). */
export const QC_SR = 48_000;

/**
 * Пороги судьи. Откалиброваны 2026-10-27 на слушаниях владельца:
 *   брак 72cb0d2b (crest 9.7 / потолок 44%), 27794753 (10.1 / 35%),
 *   79b31106 (11.6 / 31%) — REJECT; перегенерённый 72cb0d2b (12.5 / 12.5%)
 *   и корпус Jasmine (12.8-14.7 / 3-4%) — OK. По всем 213 файлах прогона:
 *   crest: p05=11.0, p25=12.6, медиана=13.6; потолок: p75=21%, p95=31%.
 */
export const QC_THRESHOLDS = {
  /** Крест-фактор (TP-I, дБ): ниже — сигнал зжат, «бочка». */
  crestReject: 11,
  crestWarn: 12,
  /** Доля окон 50мс, чей пик >= 90% общего пика (%): огибающая упирается в потолок.
   * Калибровка владельцем ухом 2026-10-27: принял 7-13% («зачетные»),
   * отверг 27% («сильно бьёт по ушам») -> REJECT 15%. WARN поднят до 10%
   * (был 5): ниже здоровые генерации 7-13% залиты подсветкой и сигнал шумит;
   * WARN = «на грани, слушать первым», OK = здоровый.
   * Каждый процент выше штрафует qcScore, так что среди прошедших побеждает
   * минимальный потолок. */
  plateauReject: 15,
  plateauWarn: 10,
  /** Длина серии подряд идущих семплов, равных глобальному экстремуму (клиппинг). */
  clipRunReject: 3,
  /**
   * Активная длительность к корпусному эталону (x). Низкая граница
   * калибрована ухом владельца 2026-10-27: 0.70x = «гиперскорость
   * произношения» (слышно) -> REJECT; заметно быстрее 0.85x -> WARN.
   */
  ratioRejectLow: 0.7,
  ratioRejectHigh: 2.5,
  ratioWarnLow: 0.85,
  ratioWarnHigh: 1.8,
  /**
   * Порог применимости ratio-правила, сек активности корпуса. На микро-корпусе
   * (< 1с) метрика нестабильна: «You! Come!» (0.34с) давала ложный 6.9× на
   * нормальной генерации (владелец 2026-10-27: файл норм) — такие фразы
   * ratio не проверяем.
   */
  ratioMinCorpusSec: 1,
  /** Свинг F0 к корпусу (п.): >= порога — дикая интонация («маньяк»). */
  f0SwingDiffWarn: 8,
  f0SwingDiffReject: 14,
  /** Сдвиг медианы F0 к корпусу (п.): регистр уехал (364 vs 72 Гц = +28). */
  f0ShiftWarn: 6,
  f0ShiftReject: 10,
  /** Окно огибающей / активности, сек. */
  plateauWinSec: 0.05,
  activeWinSec: 0.02,
  /** Порог голосовой активности, дБFS (окна тише -> пауза). */
  activeNoiseDb: -45,
  /** Пик окна считается «у потолка», если >= доли глобального пика. */
  plateauNear: 0.9,
} as const;

/** Метрики одного файла (null = замер не удался). */
export interface QcMetrics {
  file: string;
  uid: string;
  voice: string;
  /** Декодился ли файл (false => сразу REJECT). */
  decoded: boolean;
  durSec: number;
  /** Интегральный уровень / true peak / динамика (loudnorm). */
  i: number | null;
  tp: number | null;
  lra: number | null;
  /** Крест-фактор TP-I, дБ (главный маркер «бочки»). */
  crest: number | null;
  /** Доля окон, упирающихся в общий пик, %. */
  plateauPct: number;
  /** Длиннейшая серия семплов на глобальном экстремуме (клиппинг). */
  flatRun: number;
  /** Активная (неглухая) длительность речи, сек. */
  activeSec: number;
  /** Активная длительность корпусного эталона, сек (нет эталона -> null). */
  corpusActiveSec: number | null;
  /** activeSec / corpusActiveSec (нет эталона -> null). */
  ratio: number | null;
  /** Свинг F0 генерации, полутонов (p90/p10; null = не озвучен/мало фреймов). */
  f0Swing: number | null;
  /** Свинг F0 корпусного эталона, полутонов. */
  corpusF0Swing: number | null;
  /** Сдвиг медианы F0 к корпусу, полутонов (12*log2(gen/corpus); null = нет пары). */
  f0ShiftSt: number | null;
}

export type QcLevel = "OK" | "WARN" | "REJECT";

export interface QcVerdict {
  level: QcLevel;
  /** Причины: сначала REJECT-основания, потом WARN (для отчёта). */
  reasons: string[];
}

// ------------------------------------------------------------ разбор имён ---

/**
 * Имя сгенерированного файла `{uid}__{voice}__{постфикс}` -> uid/voice и база
 * корпусного эталона. Корпус (`{uid}__{voice}`, 2 части) и мусор -> null:
 * судья отвечает только за генерацию.
 */
export function parseGeneratedName(wavPath: string): { uid: string; voice: string; corpusBase: string } | null {
  const parts = basename(wavPath)
    .replace(/\.[^.]+$/, "")
    .split("__");
  if (parts.length < 3) return null;
  if (!/^[0-9a-f]{32}$/.test(parts[0])) return null;
  const dir = dirname(wavPath);
  return {
    uid: parts[0],
    voice: parts[1],
    corpusBase: join(dir, `${parts[0]}__${parts[1]}`),
  };
}

/** Путь корпусного эталона: рядом `{uid}__{voice}.opus` (или .wav во временных папках). */
export function corpusPathFor(corpusBase: string): string | null {
  for (const ext of [".opus", ".wav"]) {
    const p = corpusBase + ext;
    try {
      if (statSync(p).isFile()) return p;
    } catch {
      /* нет файла — идём дальше */
    }
  }
  return null;
}

// --------------------------------------------------------------- метрики ---

/** Декод wav/opus -> Int16 mono sr (null = не читается/недописан). */
export function decodePcmAt(file: string, sr: number): Int16Array | null {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(sr), "-f", "s16le", "-"], {
    maxBuffer: 1 << 28,
    encoding: "buffer",
    windowsHide: true,
  });
  if (r.status !== 0 || !r.stdout || r.stdout.length < 4) return null;
  const buf = r.stdout;
  const n = Math.floor(buf.length / 2);
  const s = new Int16Array(n);
  for (let i = 0; i < n; i++) s[i] = buf.readInt16LE(i * 2);
  return s;
}

/** Декод wav/opus -> Int16 mono QC_SR (null = не читается/недописан). */
export function decodePcm(file: string): Int16Array | null {
  return decodePcmAt(file, QC_SR);
}

/** Частота F0-замера: 16k достаточно для 60..400 Гц и в 3 раза быстрее. */
export const F0_SR = 16_000;

/**
 * F0 (автокорреляция, окно 40мс / шаг 20мс) по УВЕРЕННО-озвученным фреймам:
 * confidence = ac(lag*) / mean(x^2) >= 0.4 (синус ~1, шум/фрикативы ~0 — без
 * фильтра p10/p90 разлетался мусором). Отвечает на вопрос «почему маньяк»
 * (калибровка на слушаниях владельца 2026-10-27): здоровый файл держит свинг
 * близко к корпусу, «маньяк» уходит в подвывание/визг. null = озвученных
 * фреймов < 3 (короткая/неозвученная фраза).
 */
export function f0Stats(samples: Int16Array, sr = F0_SR): { med: number; swing: number } | null {
  const win = Math.round(sr * 0.04);
  const hop = Math.round(sr * 0.02);
  const minLag = Math.round(sr / 400);
  const maxLag = Math.round(sr / 60);
  const scale = 32768 * 32768;
  const lags = maxLag - minLag + 1;
  const ac = new Float64Array(lags);
  const vals: number[] = [];
  for (let i = 0; i + win <= samples.length; i += hop) {
    let meanPow = 0;
    for (let j = i; j < i + win; j++) meanPow += samples[j] * samples[j];
    meanPow /= win * scale;
    if (Math.sqrt(meanPow) < 0.02) continue;
    let gmax = 0;
    for (let k = 0; k < lags; k++) {
      const lag = minLag + k;
      let acc = 0;
      for (let j = 0; j < win - lag; j++) acc += samples[i + j] * samples[i + j + lag];
      ac[k] = acc / ((win - lag) * scale);
      if (ac[k] > gmax) gmax = ac[k];
    }
    if (gmax <= 0) continue;
    // Первый ЛОКАЛЬНЫЙ максимум >= 0.5*gmax — это период F0. Глобальный брать
    // нельзя: у синуса/звона максимум лежит на кратном периоде (ошибка октавы).
    let bi = -1;
    for (let k = 1; k < lags - 1; k++) {
      if (ac[k] >= 0.5 * gmax && ac[k] >= ac[k - 1] && ac[k] > ac[k + 1]) {
        bi = k;
        break;
      }
    }
    if (bi < 0) continue;
    const best = ac[bi];
    if (best / meanPow >= 0.4) vals.push(sr / (minLag + bi));
  }
  if (vals.length < 3) return null;
  vals.sort((a, b) => a - b);
  const q = (p: number): number => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))];
  const p10 = q(0.1);
  if (p10 <= 0) return null;
  return { med: q(0.5), swing: 12 * Math.log2(q(0.9) / p10) };
}

/** Активная длительность: окна RMS громче порога активности. */
export function activeSeconds(samples: Int16Array): number {
  const win = Math.round(QC_SR * QC_THRESHOLDS.activeWinSec);
  const thr = 10 ** (QC_THRESHOLDS.activeNoiseDb / 20) * 32767;
  let active = 0;
  for (let i = 0; i + win <= samples.length; i += win) {
    let acc = 0;
    for (let j = i; j < i + win; j++) acc += samples[j] * samples[j];
    if (Math.sqrt(acc / win) > thr) active++;
  }
  return active * QC_THRESHOLDS.activeWinSec;
}

/**
 * «Потолок» и клиппинг: доля окон 50мс, чей пик >= 90% общего пика
 * (огибающая зажата в одном уровне) и длиннейшая серия на глобальном
 * экстремуме (срезанные пики).
 */
export function envelopeStats(samples: Int16Array): { plateauPct: number; flatRun: number } {
  const n = samples.length;
  if (n === 0) return { plateauPct: 0, flatRun: 0 };
  let global = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.abs(samples[i]);
    if (v > global) global = v;
  }
  const win = Math.max(1, Math.round(QC_SR * QC_THRESHOLDS.plateauWinSec));
  let near = 0;
  let windows = 0;
  for (let i = 0; i + win <= n; i += win) {
    let p = 0;
    for (let j = i; j < i + win; j++) {
      const v = Math.abs(samples[j]);
      if (v > p) p = v;
    }
    windows++;
    if (p >= global * QC_THRESHOLDS.plateauNear) near++;
  }
  // серии подряд идущих значений, равных глобальному максимуму/минимуму
  let max = samples[0];
  let min = samples[0];
  for (let i = 1; i < n; i++) {
    if (samples[i] > max) max = samples[i];
    if (samples[i] < min) min = samples[i];
  }
  const longestAt = (val: number): number => {
    let run = 0;
    let worst = 0;
    for (let i = 0; i < n; i++) {
      if (samples[i] === val) {
        run++;
        if (run > worst) worst = run;
      } else run = 0;
    }
    return worst;
  };
  const flatRun = Math.max(longestAt(max), longestAt(min));
  return { plateauPct: windows > 0 ? (100 * near) / windows : 0, flatRun };
}

// ---------------------------------------------------------------- судья ---

/** Один знак после запятой для человекочитаемых причин. */
const f1 = (v: number): string => v.toFixed(1);

/**
 * Вердикт по метрикам: REJECT, если хоть одно жёсткое правило сработало,
 * иначе WARN при мягких сигналах, иначе OK. Reasons — для отчёта.
 */
export function judge(m: QcMetrics): QcVerdict {
  const T = QC_THRESHOLDS;
  const reject: string[] = [];
  const warn: string[] = [];

  if (!m.decoded) {
    return { level: "REJECT", reasons: ["файл не декодируется (битый/недописан)"] };
  }
  if (m.crest === null) {
    warn.push("уровень не замерился (loudnorm) — крест-фактор не проверен");
  } else if (m.crest < T.crestReject) {
    reject.push(`крест-фактор ${f1(m.crest)} дБ < ${T.crestReject} — зжатая «бочка»`);
  } else if (m.crest < T.crestWarn) {
    warn.push(`крест-фактор ${f1(m.crest)} дБ < ${T.crestWarn} — приглушённо`);
  }

  const pct = m.plateauPct.toFixed(0);
  if (m.plateauPct >= T.plateauReject) {
    reject.push(`потолок: ${pct}% окон ≈ пику (>= ${T.plateauReject}%) — огибающая зажата`);
  } else if (m.plateauPct >= T.plateauWarn) {
    warn.push(`потолок: ${pct}% окон ≈ пику (>= ${T.plateauWarn}%)`);
  }

  if (m.flatRun >= T.clipRunReject) {
    reject.push(`клиппинг: серия из ${m.flatRun} семплов на экстремуме`);
  }

  // F0: регистр/интонация — класс, пойманный ухом владельца на Atilla
  // (364 vs 72 Гц корпуса, свинг 31 ст при идеальном конверте) и на
  // «маньяке» Thomas. Пороги — дельты к корпусу.
  if (m.f0Swing !== null && m.corpusF0Swing !== null) {
    const diff = m.f0Swing - m.corpusF0Swing;
    const desc = `F0-свинг ${m.f0Swing.toFixed(1)} из корпусных ${m.corpusF0Swing.toFixed(1)} ст (Δ ${diff.toFixed(1)})`;
    if (diff >= T.f0SwingDiffReject) reject.push(`${desc} — дикая интонация`);
    else if (diff >= T.f0SwingDiffWarn) warn.push(desc);
  }
  if (m.f0ShiftSt !== null) {
    const a = Math.abs(m.f0ShiftSt);
    const desc = `регистр F0 сдвинут на ${m.f0ShiftSt.toFixed(1)} ст к корпусу`;
    if (a >= T.f0ShiftReject) reject.push(`${desc} — не тот регистр голоса`);
    else if (a >= T.f0ShiftWarn) warn.push(desc);
  }

  if (m.ratio !== null && m.corpusActiveSec !== null && m.corpusActiveSec >= T.ratioMinCorpusSec) {
    const r = m.ratio;
    const desc = `актив ${m.durSec > 0 ? (m.activeSec ?? 0).toFixed(2) : "0"}с vs корпус ${m.corpusActiveSec.toFixed(2)}с = ${r.toFixed(2)}x`;
    if (r < T.ratioRejectLow || r > T.ratioRejectHigh) {
      reject.push(`длительность к корпусу ${desc} — вне ${T.ratioRejectLow}..${T.ratioRejectHigh}x`);
    } else if (r < T.ratioWarnLow || r > T.ratioWarnHigh) {
      warn.push(`длительность к корпусу ${desc} — вне ${T.ratioWarnLow}..${T.ratioWarnHigh}x`);
    }
  }

  if (reject.length > 0) return { level: "REJECT", reasons: [...reject, ...warn] };
  if (warn.length > 0) return { level: "WARN", reasons: warn };
  return { level: "OK", reasons: [] };
}

/** Пороги скоринга для ОТБОРА лучшего (не для REJECT — тот решает judge). */
export const QC_SCORE = {
  /** Идеальный крест-фактор: медиана здоровых файлов ~13.6 дБ. */
  crestIdeal: 13,
  /** Каждый дБ просадки ниже идеала = 0.5 штрафа (11 дБ -> 1.0). */
  crestPerDb: 0.5,
  /** Потолок: 10% (граница WARN) -> штраф 1.0 (критерий владельца — главный). */
  plateauWarnNorm: 10,
  /** Длительность: 1.8x (граница WARN) -> штраф 1.0 (через ln). */
  ratioWarnNorm: Math.log(1.8),
  /** Свинг F0 от корпуса: 6 полутонов -> штраф 1.0 («маньяк» 8.5ст -> 1.4). */
  swingPerSt: 6,
  /** Сдвиг медианы F0 к корпусу: 6 полутонов -> штраф 1.0. */
  shiftPerSt: 6,
} as const;

/**
 * Сводный штраф кандидата для отбора лучшего: 0 = идеал, меньше = лучше,
 * null = REJECT (в отборе не участвует). Компоненты — отклонения от корпуса
 * и от здоровых порогов; F0-составляющие ловят «маньяка» (дикий свинг
 * интонации), которого не видят конвертные метрики.
 */
export function qcScore(m: QcMetrics): number | null {
  if (judge(m).level === "REJECT") return null;
  const S = QC_SCORE;
  let p = 0;
  if (m.crest !== null) p += Math.max(0, S.crestIdeal - m.crest) * S.crestPerDb;
  p += Math.min(m.plateauPct, 40) / S.plateauWarnNorm;
  if (m.ratio !== null && m.corpusActiveSec !== null && m.corpusActiveSec >= QC_THRESHOLDS.ratioMinCorpusSec) {
    p += Math.abs(Math.log(m.ratio)) / S.ratioWarnNorm;
  }
  if (m.f0Swing !== null && m.corpusF0Swing !== null) p += Math.abs(m.f0Swing - m.corpusF0Swing) / S.swingPerSt;
  if (m.f0ShiftSt !== null) p += Math.abs(m.f0ShiftSt) / S.shiftPerSt;
  return Math.round(p * 100) / 100;
}

/** Полный замер одного wav: декод + огибающая/активность + loudnorm + корпус. */
/** Кэш корпусных эталонов (один эталон на многие кандидаты — не декодим заново). */
const corpusCache = new Map<string, { activeSec: number | null; f0: { med: number; swing: number } | null }>();

function corpusStats(corpusPath: string): { activeSec: number | null; f0: { med: number; swing: number } | null } {
  const hit = corpusCache.get(corpusPath);
  if (hit) return hit;
  const cpcm = decodePcm(corpusPath);
  const f0pcm = decodePcmAt(corpusPath, F0_SR);
  const out = {
    activeSec: cpcm ? activeSeconds(cpcm) : null,
    f0: f0pcm ? f0Stats(f0pcm) : null,
  };
  corpusCache.set(corpusPath, out);
  return out;
}

export function measureFile(wavPath: string): QcMetrics {
  const parsed = parseGeneratedName(wavPath);
  const base: Omit<QcMetrics, "decoded" | "durSec" | "plateauPct" | "flatRun" | "activeSec"> = {
    file: wavPath,
    uid: parsed?.uid ?? "",
    voice: parsed?.voice ?? "",
    i: null,
    tp: null,
    lra: null,
    crest: null,
    corpusActiveSec: null,
    ratio: null,
    f0Swing: null,
    corpusF0Swing: null,
    f0ShiftSt: null,
  };
  const pcm = decodePcm(wavPath);
  if (!pcm) return { ...base, decoded: false, durSec: 0, plateauPct: 0, flatRun: 0, activeSec: 0 };

  const { plateauPct, flatRun } = envelopeStats(pcm);
  const activeSec = activeSeconds(pcm);
  const loud: Loudness | null = measureLoudness(wavPath);
  const crest = loud?.i != null && loud?.tp != null ? loud.tp - loud.i : null;
  const f0pcm = decodePcmAt(wavPath, F0_SR);
  const f0 = f0pcm ? f0Stats(f0pcm) : null;

  let corpusActiveSec: number | null = null;
  let corpusF0: { med: number; swing: number } | null = null;
  if (parsed) {
    const corpus = corpusPathFor(parsed.corpusBase);
    if (corpus) {
      const cs = corpusStats(corpus);
      corpusActiveSec = cs.activeSec;
      corpusF0 = cs.f0;
    }
  }
  return {
    ...base,
    decoded: true,
    durSec: pcm.length / QC_SR,
    i: loud?.i ?? null,
    tp: loud?.tp ?? null,
    lra: loud?.lra ?? null,
    crest,
    plateauPct,
    flatRun,
    activeSec,
    corpusActiveSec,
    ratio: corpusActiveSec !== null && corpusActiveSec > 0 ? activeSec / corpusActiveSec : null,
    f0Swing: f0?.swing ?? null,
    corpusF0Swing: corpusF0?.swing ?? null,
    f0ShiftSt: f0 && corpusF0 ? 12 * Math.log2(f0.med / corpusF0.med) : null,
  };
}

// ------------------------------------------------------------------ CLI ---

/** Обход папки: все сгенерированные wav (корпус и мусор пропускаются). */
export function scanGenerated(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".wav") && parseGeneratedName(p)) out.push(p);
    }
  };
  walk(dir);
  return out.toSorted();
}

interface QcCli {
  dir: string;
  lang: string;
  filter: string;
  json: string;
  rejects: string;
  all: boolean;
  /** Таблица отбора: кандидаты каждой фразы, отсортированные по qcScore. */
  rank: boolean;
  /** Печатать только путь лучшего кандидата каждой фразы (для скриптов). */
  pick: boolean;
  /**
   * Промоут: лучший кандидат (_s{seed}) копируется в каноническое имя
   * ({uid}__{voice}__Vox.wav), все кандидаты уезжают в архив <archive>.
   * Пайплайн: bench --seeds -> qc --promote -> qc (финальный контроль).
   */
  promote: boolean;
  /** Архив кандидатов при --promote (дефолт: tmp/voxcpm_bench/rejected). */
  archive: string;
  /**
   * Выровнять уровень (-16 LUFS/TP -1.5) на ОДОБРЁННЫХ (не REJECT) файлах
   * ПОСЛЕ судьи — решение владельца 2026-10-27: фильтр до судьи искажает
   * звук, судья обязан судить СЫРОЙ материал (генерация без фильтров).
   */
  normalize: boolean;
  help: boolean;
}

export function parseQcCli(argv: string[]): QcCli {
  const o: QcCli = {
    dir: "",
    lang: "ru",
    filter: "",
    json: "",
    rejects: "",
    all: false,
    rank: false,
    pick: false,
    promote: false,
    archive: "",
    normalize: false,
    help: false,
  };
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
      case "--json":
        o.json = next();
        break;
      case "--rejects":
        o.rejects = next();
        break;
      case "--all":
        o.all = true;
        break;
      case "--rank":
        o.rank = true;
        break;
      case "--pick":
        o.pick = true;
        break;
      case "--promote":
        o.promote = true;
        break;
      case "--archive":
        o.archive = next();
        break;
      case "--normalize":
        o.normalize = true;
        break;
      case "--help":
      case "-h":
        o.help = true;
        break;
      default:
        throw new Error(
          `неизвестная опция: ${argv[i]} (есть --dir/--lang/--filter/--json/--rejects/--rank/--pick/--promote/--archive/--normalize/--all/--help)`,
        );
    }
  }
  if (!o.dir) o.dir = join(PKG_ROOT, "audio", `vo_${o.lang}`);
  if (!o.archive) o.archive = join(PKG_ROOT, "..", "..", "tmp", "voxcpm_bench", "rejected");
  return o;
}

export const QC_USAGE = [
  "vox_qc.mts — судья генерируемых wav (брак -> REJECT до прослушивания)",
  "  --dir <папка>     что проверять (дефолт: audio/vo_<lang>)",
  "  --lang <ru>       язык для дефолтного --dir",
  "  --filter <строка> проверять только файлы, содержащие строку",
  "  --json <файл>     записать полный отчёт JSON",
  "  --rejects <файл>  записать фразы REJECT (arc/uid__voice на строку) — еда для",
  "                    `voxcpm_bench.mts --uids @этот-файл` (перегенерация брака)",
  "  --rank            таблица отбора: кандидаты каждой фразы по qcScore (0=идеал)",
  "  --pick            только путь лучшего кандидата каждой фразы (для скриптов)",
  "  --promote         лучший кандидат -> каноническое {имя}.wav, остальные _s{seed}",
  "                    -> архив (--archive, дефолт tmp/voxcpm_bench/rejected/<arc>/)",
  "  --normalize       выровнять уровень (-16/TP-1.5) на ОДОБРЁННЫХ (не REJECT)",
  "                    ПОСЛЕ судьи — генерация даёт сырой wav, фильтра до судьи нет",
  "  --all             печатать строки и OK-файлов",
  "  --help            эта справка",
  "Отбор: кандидаты `voxcpm_bench.mts --seeds` ({имя}_s{seed}.wav) сравниваются",
  "по сводному штрафу qcScore (crest/потолок/длительность/F0 к корпусу);",
  "победитель копируется в каноническое {uid}__{voice}__Vox.wav.",
  "Exit code 1, если есть хотя бы один REJECT.",
].join("\n");

async function main(): Promise<number> {
  let cli: QcCli;
  try {
    cli = parseQcCli(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    console.error(QC_USAGE);
    return 1;
  }
  if (cli.help) {
    console.log(QC_USAGE);
    return 0;
  }

  let files: string[];
  try {
    files = scanGenerated(cli.dir);
  } catch (e) {
    console.error(`папка недоступна: ${cli.dir} (${e instanceof Error ? e.message : String(e)})`);
    return 1;
  }
  if (cli.filter) files = files.filter((f) => f.includes(cli.filter));
  if (files.length === 0) {
    console.error(`нет сгенерированных wav в ${cli.dir}${cli.filter ? ` (filter=${cli.filter})` : ""}`);
    return 1;
  }

  console.log(`судья VoxQC: ${files.length} файл(ов) из ${cli.dir}`);
  type Row = QcMetrics & { verdict: QcVerdict; score: number | null };
  const rows: Row[] = [];
  const counts: Record<QcLevel, number> = { OK: 0, WARN: 0, REJECT: 0 };
  let normed = 0;
  let normFailed = 0;
  for (const f of files) {
    const m = measureFile(f);
    const verdict = judge(m);
    rows.push({ ...m, verdict, score: qcScore(m) });
    counts[verdict.level]++;
    if (cli.normalize && verdict.level !== "REJECT") {
      // Фильтр уровня — ТОЛЬКО после судьи и только на одобренных
      // (решение владельца 2026-10-27): сырой вердикт -> выравнивание
      if (normalizeWav(f, QC_SR)) normed++;
      else normFailed++;
    }
    if (verdict.level !== "OK" || cli.all) {
      console.log(
        `${verdict.level.padEnd(6)} | crest ${m.crest === null ? " - " : m.crest.toFixed(1).padStart(4)} | ` +
          `потолок ${m.plateauPct.toFixed(0).padStart(2)}% | ${m.durSec.toFixed(2)}с | ` +
          `к-во ${m.ratio === null ? "  - " : m.ratio.toFixed(2) + "x"} | ` +
          `${relative(cli.dir, f)}`,
      );
      for (const r of verdict.reasons) console.log(`         - ${r}`);
    }
  }

  // Отбор лучших кандидатов (--seeds -> {имя}_s{seed}.wav): одна фраза = группа
  // uid+voice в одной папке, REJECT-кандидаты (score null) из борьбы выбывают
  type Winner = { row: Row; score: number };
  const winners: Winner[] = [];
  if (cli.rank || cli.pick) {
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const key = `${dirname(r.file)}|${r.uid}|${r.voice}`;
      const g = groups.get(key);
      if (g) g.push(r);
      else groups.set(key, [r]);
    }
    for (const [, g] of groups) {
      const ranked = g.filter((r) => r.score !== null).toSorted((a, b) => (a.score ?? 0) - (b.score ?? 0));
      if (ranked.length === 0) {
        console.log(`\n=== ОТБОР ${g[0].uid}__${g[0].voice}: годных кандидатов нет (все REJECT) ===`);
        continue;
      }
      const best = ranked[0];
      winners.push({ row: best, score: best.score as number });
      if (cli.rank) {
        console.log(
          `\n=== ОТБОР ${relative(cli.dir, dirname(best.file))}/${best.uid}__${best.voice}` +
            ` — ${g.length} канд., годных ${ranked.length} ===`,
        );
        ranked.forEach((r, i) => {
          const seed = /_s(\d+)$/.exec(basename(r.file).replace(/\.wav$/, ""))?.[1];
          console.log(
            `${i === 0 ? "★" : " "} ${r.score!.toFixed(2).padStart(5)} | crest ${
              r.crest === null ? " - " : r.crest.toFixed(1).padStart(4)
            } | потолок ${r.plateauPct.toFixed(0).padStart(2)}% | ` +
              `F0-свинг ${r.f0Swing === null ? "  -" : r.f0Swing.toFixed(1)} из ${
                r.corpusF0Swing === null ? "  -" : r.corpusF0Swing.toFixed(1)
              }ст | ${basename(r.file)}${seed ? ` (seed ${seed})` : ""}`,
          );
        });
      }
    }
  }

  if (cli.json) {
    mkdirSync(dirname(cli.json), { recursive: true });
    writeFileSync(cli.json, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
    console.log(`отчёт JSON: ${cli.json}`);
  }
  if (cli.rejects) {
    // Список фраз брака в формате `arc/uid__voice` (uid = md5(текста) shared
    // между голосами — см. filterByUids) — готовая еда для
    // `voxcpm_bench.mts --uids @файл` (записываем всегда, даже пустым,
    // чтобы застылым прошлым списком не перегенерировать лишнего)
    const entries = rows
      .filter((r) => r.verdict.level === "REJECT")
      .map((r) => {
        const rel = relative(cli.dir, r.file);
        const hasArc = rel.includes("/") || rel.includes("\\");
        const arc = hasArc ? dirname(rel).split(/[\\/]/)[0] : "";
        const base = `${r.uid}__${r.voice}`;
        return arc ? `${arc}/${base}` : base;
      });
    mkdirSync(dirname(cli.rejects), { recursive: true });
    writeFileSync(cli.rejects, entries.join("\n") + (entries.length > 0 ? "\n" : ""), "utf8");
    console.log(`фразы брака (${entries.length}): ${cli.rejects}`);
  }
  if (cli.promote) {
    // Промоут по группам «каноническое имя -> кандидаты _s{seed}»: лучший
    // (минимум qcScore среди не-REJECT) копируется в каноническое имя,
    // ВСЕ кандидаты уезжают в архив tmp/voxcpm_bench/rejected/<arc>/
    // (имя в архиве уникально: подпапка = арка исходного файла).
    const archiveRoot = cli.archive;
    const byCanon = new Map<string, Row[]>();
    for (const r of rows) {
      const b = basename(r.file, ".wav");
      if (!/_s\d+$/.test(b)) continue; // канонический файл — не кандидат
      const canon = join(dirname(r.file), `${b.replace(/_s\d+$/, "")}.wav`);
      const g = byCanon.get(canon);
      if (g) g.push(r);
      else byCanon.set(canon, [r]);
    }
    if (byCanon.size === 0) console.log("промоут: кандидатов _s{seed} нет — нечего промоутить");
    let promoted = 0;
    let archived = 0;
    let failed = 0;
    for (const [canon, g] of byCanon) {
      const ranked = g.filter((r) => r.score !== null).toSorted((a, b2) => (a.score ?? 0) - (b2.score ?? 0));
      const archDir = join(archiveRoot, basename(dirname(canon)));
      if (ranked.length > 0) {
        const win = ranked[0];
        const winPath = win.file; // локальная копия ДО мутации ниже (win === строка из winners)
        copyFileSync(winPath, canon);
        promoted++;
        console.log(`★ промоут ${basename(canon)} <- ${basename(winPath)} (score ${win.score})`);
      } else {
        failed++;
        console.log(`✗ без промоута ${basename(canon)}: годных кандидатов нет (все REJECT)`);
      }
      mkdirSync(archDir, { recursive: true });
      // Сначала убираем кандидатов (по их ОРИГИНАЛЬНЫМ путям _s{seed})...
      for (const r of g) {
        const target = join(archDir, basename(r.file));
        rmSync(target, { force: true }); // редкая коллизия (одно имя из разных прогонов) — затираем
        renameSync(r.file, target);
        archived++;
      }
      // ...и только теперь перестраиваем winners на канонический путь (для --pick):
      // строки генерировались из rows, их file до сих пор указывает на _s{seed}
      if (ranked.length > 0) {
        const w = winners.find((x) => x.row.file === ranked[0].file);
        if (w) w.row.file = canon;
      }
    }
    console.log(`промоут итог: ${promoted} канонических, ${failed} без годных, кандидатов в архив: ${archived}`);
  }

  console.log(`\n=== ИТОГ: ${counts.REJECT} REJECT, ${counts.WARN} WARN, ${counts.OK} OK из ${rows.length} ===`);
  if (cli.normalize) console.log(`уровень выровнен после одобрения: ${normed} (не выровнялось: ${normFailed})`);
  if (counts.REJECT > 0) console.log("REJECT — перегенерировать (другой seed/конфиг) или выкинуть:");
  for (const r of rows.filter((x) => x.verdict.level === "REJECT")) {
    console.log(`  ${relative(cli.dir, r.file)} — ${r.verdict.reasons[0]}`);
  }
  if (cli.pick) {
    // После маркера — по одному пути на фразу (лучший по qcScore);
    // скрипт берёт строки после "=== PICK ==="
    console.log("=== PICK ===");
    for (const w of winners) console.log(w.row.file);
  }
  return counts.REJECT > 0 ? 1 : 0;
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
