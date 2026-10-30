/**
 * voxcpm_bench.mts — СТЕНД генерации VoxCPM2: перебор конфигов + пилотные прогоны.
 *
 * Задача (владелец, 2026-10-27): генератор ведёт себя хаотично — одни фразы
 * звучат отлично, другие ужасно и по-разному по динамике. Стенд даёт два режима:
 *
 *   1. МАТРИЦА (без доп. опций): одна фраза (--uid, дефолт — тренировочная
 *      2bd6a3aac9e53970fcbf557dcd253cf0) × сетка конфигов -> файлы
 *      `{uid}__{voice}__N_cfg{X}_ts{Y}`. Итог выбора владельца: сначала
 *      cfg3.0/ts30 (матрица), потом отбракован на проблемной фразе
 *      c3bb3d2b («захлебывается») -> подбор `--cfgs 2,2.25,2.5` дал
 *      победителя cfg2.5/ts30 (файл __Narrator__5_cfg2.5_ts30) — это и есть
 *      ДЕФОЛТ шима voxcpmworker.py (DEFAULT_CFG/DEFAULT_TIMESTEPS, реш.
 *      владельца 2026-10-27); худший в первичной матрице — cfg1.5/ts10.
 *
 *   2. ПИЛОТ `--picks N`: N РАЗНЫХ фраз ru (детерминированная выборка selectSample)
 *      -> каждая новым конфигом в файл `{uid}__{voice}__Vox_cfg{cfg}_ts{ts}.wav` —
 *      КОНФИГ В ИМЕНИ (реш. владельца 2026-10-27): по именам читается
 *      статистика «голос -> на каком cfg вышло хорошо/плохо»; старые версии
 *      фразы (другой cfg/seed) при регенерации убираются — остаётся
 *      актуальная попытка. Суффикс `__Vox` (имя движка) — чтобы пара в папке
 *      читалась сама: `{uid}__{voice}.opus` = корпус CosyVoice,
 *      `{uid}__{voice}__Vox_cfg{X}.wav` = VoxCPM2.
 *
 *   3. ПО ГОЛОСУ `--each-voice [--per-voice N]`: по N фраз НА КАЖДЫЙ голос из
 *      пула (72 голоса) — прослушка VoxCPM2 на разных тембрах, всё тем же
 *      именем `{uid}__{voice}__Vox_cfg{cfg}_ts{ts}`; фильтр `--voice Sarah,Kate`
 *      (повторяемый) сузит список, неизвестный голос = стоп со списком
 *      доступных.
 *
 * `{voice}` — спикер ИЗ POT (Phrase.voice: Narrator/Kate/...), как в корпусе
 * `{uid}__{voice}.opus`: владелец 2026-10-27 просил не плейсхолдер, а имя
 * спикера («у нас же спикер — это переменная из pot»).
 *
 * Правила стенда:
 *   - ТОЛЬКО ru (остальные языки владелец отложил);
 *   - wav — СЫРОЙ выход модели БЕЗ trim и БЕЗ фильтра уровня: выравнивание
 *     (-16 LUFS / TP -1.5) применяется ТОЛЬКО ПОСЛЕ СУДЬИ на одобренных
 *     файлах (`vox_qc.mts --normalize`) — решение владельца 2026-10-27:
 *     фильтр до судьи создаёт искажения, и судья судит уже обработанный
 *     звук. opus стенд НЕ пишет («я просил только wav, opus — инфошум»);
 *   - нумерация: пилот/по-голосовому — суффикс `{voice}__Vox_cfg{cfg}_ts{ts}` (конфиг
 *     в имени); матрица/подбор cfg — номер `{voice}__N` с 2 (N=1 — «базовый»);
 *   - корпус НЕ пересобирается, чужие файлы не трогаются.
 *
 * Нативная частота VoxCPM2 = 48000 Гц (audio_vae_config.out_sample_rate) —
 * это потолок модели, wav остаются 48k (loudnorm тоже с -ar 48000);
 * 24000 в корпусе — история opus-кодирования, здесь не задействована.
 *
 * Матрица (полный разворот, решение владельца 2026-10-27):
 *   cfg 1.5/2.0/2.5/3.0 × timesteps 10/20/30  = 12 прогонов
 *   + cfg2.0/ts10 с retry_badcase=false        (ретрай у модели включён сам)
 *   + cfg2.0/ts10 с normalize=true             (текстовая нормализация входа)
 *   = 14 прогонов. Обе одиночные точки дали байт-в-байт тот же файл, что и
 *   базовый cfg2.0/ts10 -> для этой фразы оба no-op. Детерминизм подтверждён:
 *   один seed => одинаковые байты и между прогонами, и между процессами.
 *
 * КОНФИГУРИРОВАНИЕ (дока + оперативный доступ, реш. владельца 2026-10-27):
 *
 *   ПОЛНАЯ ТАБЛИЦА КНОБКОВ — `VOX_KNOBS` ниже: ЕДИНЫЙ источник правды для
 *   шапки, валидации `--opt` и консольной справки (DRY). Быстрый срез самых
 *   ходовых:
 *
 *     cfg_value            1.0-3.0   (дефолт шима 2.5, модель 2.0)
 *     inference_timesteps  4-30      (дефолт 30; ts30 ≈ 2x времени ts10)
 *     normalize / retry_badcase / retry_badcase_max_times /
 *     retry_badcase_ratio_threshold / min_len / max_len — в VOX_KNOBS
 *     denoise              НЕДОСТУПЕН (шим грузит load_denoiser=False)
 *
 *   ЖЁСТКО НЕТ в API generate(): сэмплинга (temperature/top_p) — модель
 *   детерминирована по seed; seed даём через torch.manual_seed в шиме
 *   (best-effort, CUDA не fully детерминирован).
 *
 *   СПРАВКА В КОНСОЛЬ: `... --knobs` печатает таблицу VOX_KNOBS и уходит.
 *   ОПЕРАТИВНО НА ПРОГОН: повторяемый флаг `--opt key=value` (ключи/типы
 *   валидируются по VOX_KNOBS — опечатка или недоступный кнобок = стоп;
 *   cfg_value/inference_timesteps только через --cfg/--ts, чтобы не было
 *   двух источников правды). Метка `_key=value` дописывается в имя файла,
 *   поэтому эксперимент НЕ затирает предыдущие сэмплы.
 *
 *   ОФ. ДОКИ: параметры и quality tuning —
 *     https://voxcpm.readthedocs.io/en/latest/usage_guide.html
 *   остальное — quickstart.html, cookbook.html («A Voice Chef's Guide»),
 *   reference/api.html, faq.html; репо https://github.com/OpenBMB/VoxCPM.
 *   Первоисточник дефолтов — voxcpm/core.py::_generate (локальный пакет
 *   voxcpm 2.0.3, venv C:/tools/voxcpm2).
 *
 * ЗАПУСК (из корня репы):
 *   node patches/ai-voice-pack/tools/generate/scripts/voxcpm_bench.mts --dry-run      # план матрицы
 *   node patches/ai-voice-pack/tools/generate/scripts/voxcpm_bench.mts                 # матрица (14 прогонов)
 *   ... --only 7                                                                      # одна точка матрицы
 *   ... --cfgs 2,2.25,2.5 --ts 30                                                     # подбор cfg на одной фразе
 *   ... --picks 10                                                                    # 10 разных фраз
 *   ... --picks 10 --seed 7                                                           # другие 10 фраз
 *   ... --arc StoryBeginnings --picks 9999 --resume --seed 49 --cfg 2.6 --ts 30      # очередь (resume)
 *      (--resume: фразы с готовым opus ПРОПУСКАЮТСЯ — обрыв/остановка/ребут не теряют
 *       прогресс, повторный запуск продолжает с места; массовый обход арок/языков —
 *       vox_queue.mts, он и гоняет это с конфигом пролога)
 *   ... --knobs                                                                       # справочник кнобков
 *   ... --picks 10 --opt normalize=true --opt retry_badcase=false                     # оперативный конфиг
 *   ... --each-voice --per-voice 3                                                    # 72 голоса x 3 фразы
 *   ... --each-voice --voice Sarah,Kate --per-voice 1                                 # только эти голоса
 *   ... --picks 1 --uid <uid> --seed 42                                               # перегенерить одну фразу
 *      (в пилот-режиме --uid работает только при явной передаче; другой seed = новый
 *       дубль, тот же seed = байт-в-байт тот же файл — детерминизм)
 *   ... --uids @tmp/voxcpm_bench/rejects.txt --seed 42                                # перегенерить список брака
 *      (`arc/uid__voice` на строку — формат `vox_qc.mts --rejects`; можно и --uids a,b,c;
 *       объём задают сами uids: --picks/--each-voice/--uid с ними не сочетаются;
 *       без arc/voice элемент обязан дать ровно 1 фразу — uid общ для голосов)
 *   ... --picks 1 --uid <uid> --seeds 7,42,43                                        # кандидаты бок-о-байт
 *      (файлы {имя}_s{seed}.wav — несколько seed'ов одной фразы рядом; отбор:
 *       `vox_qc.mts --filter <uid> --rank` / `--pick`, победитель -> каноническое
 *       победитель -> каноническое имя {uid}__{voice}__Vox_cfg{cfg}_ts{ts}.wav)
 *
 * ПАЙПЛАЙН (владелец 2026-10-28, инлайн с 2026-10-30): генерация СЫРЫМ wav ->
 * СРАЗУ после записи каждой фразы конвейер (выравнивание -16/TP-1.5 ->
 * opus 48 kHz/24 kbps -> удаление wav) -> в папке ТОЛЬКО opus, пачка wav
 * не накапливается (~10x места), обрыв оставляет максимум один недоконвер-
 * тированный wav (а не сотни). Vox-стандарт: OpusHead 48000 + битрейт 24k.
 * Отключение конвейера: --raw (сырой wav остаётся — для отладки/экспериментов).
 * ИТОГ: консольная таблица + tmp/voxcpm_bench/last.jsonl (пофразовино) +
 * gen_times.jsonl (накопительный журнал скоростей: cfg/ts/genSec по каждой генерации).
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { ENGINES, loadCatalog, type Args, type Phrase, PKG_ROOT, selectPhrases } from "./voice_batch.mts";
import { selectSample } from "./voice_bench.mts";
import { normalizeWav, opusPathFor, wavToOpus, writeWav16 } from "./voicekit/audio.mts";
import { VoiceWorker } from "./voicekit/worker.mts";

/** Репа-корень: PKG_ROOT = patches/ai-voice-pack -> ../../. */
const REPO_ROOT = join(PKG_ROOT, "..", "..");
const BENCH_DIR = join(REPO_ROOT, "tmp", "voxcpm_bench");
/** Тренировочная фраза стенда (та, на которой виден хаос генерации). */
export const TRAIN_UID = "2bd6a3aac9e53970fcbf557dcd253cf0";
/** Дефолты стенда = дефолты шима. ЛЕСТНИЦА владельца (2026-10-27):
 * старт 2.6 (яркость) -> REJECT -> -0.2 за круг (2.6/2.4/2.2/2.0/1.8/1.6),
 * пол 1.6. Круги: `--uids @rejects --seed <42+k> --cfg <2.6-0.2*k>`. */
export const DEFAULT_CFG = 2.6;
export const DEFAULT_TIMESTEPS = 30;

/**
 * КАЛИБРОВКА CFG (стенд --cfgs x --seeds + судья vox_qc, 2026-10-27).
 * Две контрастные фразы, по которым выбиралась стратегия:
 *
 * A) «орущая» 556f9ed9__Jasmine (ухом отвергнута при 27% потолка):
 *   cfg 1.6 -> 4/4 годны, потолок 6-13%   | cfg 2.0 -> 3/4, 8-12%
 *   cfg 2.2 -> 2/8 (прошли 9%, отвергнуты 19-25%) | cfg 2.5 -> 2/13 (мед. 19%)
 * B) «приглушённая» 4e316fe2__Sarah (crest 11.6 при 2.5):
 *   cfg 1.6 -> 3/3, топ-3, crest 12.1-13.7, потолок 2-7%
 *   cfg 2.0 -> 3/3, crest 12.6-13.4        | cfg 2.2 -> 2/3 (один REJECT-бочка)
 *   cfg 2.5 (канон) -> crest 11.6, потолок 11%
 *
 * ВЫВОД: «ор» (потолок) и «приглушённость» (crest) — один корень: CFG
 * oversaturation (Disney Research «Eliminating Oversaturation...», TTS-обзор
 * salivity: оптимум 1.2-2.5, выше — clipping динамики). Кривая монотонна:
 * НИЖЕ cfg -> ниже потолок И ВЫШЕ crest. Стратегия владельца: база 2.0
 * (офиц. дефолт), REJECT-фразы -> cfg -0.1 за круг до пола 1.6 (там 100%).
 */
export const CFG_CALIBRATION = "2026-10-27: 1.6=4/4+3/3, 2.0=3/4+3/3, 2.2=2/8+2/3, 2.5=2/13";

// --------------------------------------------------- кнобки VoxCPM2 -------

/** Один кнобок генерации VoxCPM2 (строка справочника VOX_KNOBS). */
export interface VoxKnob {
  /** Ключ genOpts = имя параметра generate() (GEN_OPTS в voxcpmworker.py). */
  key: string;
  /** Тип значения (валидация `--opt`). */
  type: "number" | "boolean";
  /** Дефолт: дефолт шима/стенда, в скобках — дефолт самой модели. */
  def: string;
  /** Рабочий диапазон из офиц. доки (usage_guide.html). */
  range: string;
  /** Что делает и когда оперативно менять. */
  effect: string;
  /** Причина, почему кнобок НЕДОСТУПЕН у нас (валидация --opt его отклоняет). */
  off?: string;
}

/**
 * Полная таблица кнобков VoxCPM2 — единственный источник правды (шапка файла,
 * валидация `--opt`, справка `--knobs`). Источники: офиц. usage guide
 * (https://voxcpm.readthedocs.io/en/latest/usage_guide.html) + первоисточник
 * сигнатуры `voxcpm/core.py::_generate` (пакет voxcpm 2.0.3). Ресёрч 2026-10-27.
 */
export const VOX_KNOBS: readonly VoxKnob[] = [
  {
    key: "cfg_value",
    type: "number",
    def: "2.5 (модель 2.0)",
    range: "1.0-3.0",
    effect:
      "сила guidance: выше -> строже по тексту, но шумит/«захлёбывается» (3.0 отбракован); " +
      "ниже -> свободнее и естественнее; при шуме/гуле/длинном тексте опускать до 1.5-1.6",
  },
  {
    key: "inference_timesteps",
    type: "number",
    def: "30 (модель 10)",
    range: "4-30",
    effect: "шаги CFM-диффузии: больше -> детальнее и стабильнее, но дольше (ts30 ≈ 2x времени ts10)",
  },
  {
    key: "normalize",
    type: "boolean",
    def: "false",
    range: "bool",
    effect:
      "текстовая нормализация входа (числа/даты раскрываются в слова); включить для «сырого» текста, " +
      "выключить, если даём фонемы ({HH AH0 L OW1} / {ni3}); в матрице — точка _norm (no-op на этой фразе)",
  },
  {
    key: "retry_badcase",
    type: "boolean",
    def: "true",
    range: "bool",
    effect:
      "авто-ретрай генерации, аномально короткой/длинной относительно текста; в проде включён, " +
      "выключение — точка матрицы _retryOff (на тренировочной фразе дала байт-в-байт тот же файл)",
  },
  {
    key: "retry_badcase_max_times",
    type: "number",
    def: "3",
    range: ">=1",
    effect:
      "сколько максимум ПОПЫТОК суммарно при retry_badcase=true (каждая = полная перегенерация; " +
      "все упёрлись -> возвращается последняя, плохая). Решение владельца 2026-10-27: оставляем 3 — " +
      "замер на 10 фразах дал 0 срабатываний, а 10 = до 10 полных генераций на фразу в worst case",
  },
  {
    key: "retry_badcase_ratio_threshold",
    type: "number",
    def: "6.0",
    range: ">0",
    effect:
      "порог «аномальности»: потолок длины = min(len_текста x ratio + 10, max_len); " +
      "менять, если ретраи срабатывают на нормальных длинных фразах (или не срабатывают на мусоре)",
  },
  {
    key: "min_len",
    type: "number",
    def: "2",
    range: "сек",
    effect: "минимальная длина аудио — защита от крошечных обрубков вместо фразы",
  },
  {
    key: "max_len",
    type: "number",
    def: "4096",
    range: "токены",
    effect:
      "потолок длины генерации; ДЛИННЫЙ ТЕКСТ — главный источник гула/разгона/OOM: " +
      "резать на короткие сегменты и склеивать (см. usage guide «Long text»), а не поднимать max_len",
  },
  {
    key: "denoise",
    type: "boolean",
    def: "true",
    range: "bool",
    effect:
      "шумодав РЕФА (16 кГц, слегка меняет тембр) — НЕ выхода; прод-дефолт ВКЛ (владелец 2026-10-28), opt-out: --opt denoise=false; " +
      "требует запуска стенда с VOXCPM_DENOISER=1 (шим грузит ZipEnhancer); " +
      "проба владельца 2026-10-27 (оф. доки: на чистых рефах — False)",
  },
];

/** Кнобки, которые в --opt нельзя: продублированы отдельным флагом. */
const OPT_FORBIDDEN: Record<string, string> = {
  cfg_value: "используй --cfg",
  inference_timesteps: "используй --ts",
};

/**
 * Разбор `--opt key=value` с валидацией по VOX_KNOBS: ключ обязан быть известным
 * кнобком, значение — по типу кнобка (недоступный/опечатанный ключ = стоп, а не
 * молча игнорируемый шимом no-op).
 */
export function parseOpt(spec: string): [string, number | boolean] {
  const i = spec.indexOf("=");
  if (i < 1) throw new Error(`--opt нужен в формате key=value: "${spec}"`);
  const key = spec.slice(0, i).trim();
  const raw = spec.slice(i + 1).trim();
  if (key in OPT_FORBIDDEN) throw new Error(`--opt ${key}: ${OPT_FORBIDDEN[key]} (два источника правды)`);
  const knob = VOX_KNOBS.find((k) => k.key === key);
  if (!knob) throw new Error(`--opt неизвестный кнобок: ${key} (список — --knobs)`);
  if (knob.off) throw new Error(`--opt ${key}: недоступен — ${knob.off}`);
  if (knob.type === "boolean") {
    if (raw !== "true" && raw !== "false") throw new Error(`--opt ${key}: ждём true/false, получено "${raw}"`);
    return [key, raw === "true"];
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`--opt ${key}: ждём число, получено "${raw}"`);
  return [key, n];
}

/**
 * Метка `--opt` для имени файла (сортировка по ключу — имена стабильны).
 * denoise=true -> `_dn`: владелец 2026-10-28 («название дурацкое» — полный
 * `_denoise=true` в имени не нужен, компактный `dn` читаемее).
 */
export function optTag(opts: Record<string, number | boolean>): string {
  return Object.entries(opts)
    .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => (k === "denoise" && v === true ? "_dn" : `_${k}=${v}`))
    .join("");
}

/** Справка `--knobs`: таблица VOX_KNOBS в консоль (тот же источник, что и валидация). */
export function knobsText(): string {
  const W = { key: 31, def: 18, range: 10 };
  const row = (key: string, def: string, range: string, effect: string): string =>
    `  ${key.padEnd(W.key)} ${def.padEnd(W.def)} ${range.padEnd(W.range)} ${effect}`;
  const gap = `${"".padEnd(W.key + W.def + W.range + 3)}`;
  const lines = [
    "кнобки VoxCPM2 (--opt key=value; офиц. доки: voxcpm.readthedocs.io/en/latest/usage_guide.html):",
    "",
    row("ключ", "дефолт", "диапазон", "что делает"),
    `  ${"-".repeat(W.key)} ${"-".repeat(W.def)} ${"-".repeat(W.range)} ${"-".repeat(24)}`,
  ];
  for (const k of VOX_KNOBS) {
    const head = row(k.key, k.def, k.range, k.effect);
    lines.push(k.off ? `${head}\n  ${gap}^ НЕДОСТУПЕН: ${k.off}` : head);
  }
  lines.push(
    "",
    "  + seed — НЕТ в API generate(): шим даёт torch.manual_seed (best-effort);",
    '  + --emotion -> стиль-префикс "(<инструкция>)<текст>" (формат офиц. README);',
    "  + реф: 5-30с, чище = лучше; без рефа голос случайный каждый раз;",
    "  + только --cfg/--ts задают cfg_value/inference_timesteps (--opt их отклоняет).",
  );
  return lines.join("\n");
}

// ------------------------------------------------------------- матрица ---

/** Точка матрицы: один прогон = один конфиг. */
export interface BenchRun {
  cfg: number;
  ts: number;
  /** Суффикс имени файла (пусто у базовых точек сетки). */
  suffix: string;
  /** Доп. опции шима (GEN_OPTS в voxcpmworker.py), кроме cfg/ts. */
  extra: Record<string, unknown>;
}

export const CFG_GRID = [1.5, 2.0, 2.5, 3.0];
export const TS_GRID = [10, 20, 30];

/** Полная матрица стенда: сетка cfg×ts + две одиночные точки. */
export function buildMatrix(): BenchRun[] {
  const runs: BenchRun[] = [];
  for (const cfg of CFG_GRID) {
    for (const ts of TS_GRID) runs.push({ cfg, ts, suffix: "", extra: {} });
  }
  // Ретрай бэдкейсов У модели включён по умолчанию (в проде он активен) —
  // точка с выключенным показывает, что он реально делает.
  runs.push({ cfg: 2.0, ts: 10, suffix: "_retryOff", extra: { retry_badcase: false } });
  runs.push({ cfg: 2.0, ts: 10, suffix: "_norm", extra: { normalize: true } });
  return runs;
}

/** cfg в имени/таблице: 2 -> "2.0", 1.5 -> "1.5" (целые пишем с .0). */
export function fmtCfg(cfg: number): string {
  return Number.isInteger(cfg) ? `${cfg}.0` : String(cfg);
}

/**
 * Имя файла матричного режима: `{uid}__{voice}__{N}_cfg{X}_ts{Y}{суффикс}`.
 * Шаблон владельца: «{uid}__{спикер}__{N} + метка конфига» (2026-10-27);
 * спикер — переменная из POT (Phrase.voice), как в корпусных именах.
 */
export function matrixName(uid: string, voice: string, n: number, run: BenchRun): string {
  return `${uid}__${voice}__${n}_cfg${fmtCfg(run.cfg)}_ts${run.ts}${run.suffix}`;
}

/** Опции генерации для точки матрицы (то, что уходит шиму в "opts"). */
export function runOpts(run: BenchRun, seed: number): Record<string, unknown> {
  return { cfg_value: run.cfg, inference_timesteps: run.ts, ...run.extra, seed };
}

// ------------------------------------------------------------- замеры -----

export interface Loudness {
  /** Интегральный уровень, LUFS (null = неизмеримо, тишина/-inf). */
  i: number | null;
  /** True peak, dBTP. */
  tp: number | null;
  /** Loudness range, LU (динамика внутри фразы). */
  lra: number | null;
}

/** Число из JSON loudnorm: "-inf"/мусор -> null. */
function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Замер уровня wav одним прогоном ffmpeg (measurement-режим loudnorm).
 * Нужен для сравнения ДИНАМИКИ между конфигами — главная жалоба владельца.
 */
export function measureLoudness(wavPath: string): Loudness | null {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", wavPath, "-af", "loudnorm=print_format=json", "-f", "null", "-"],
    { encoding: "utf8", windowsHide: true, timeout: 120_000 },
  );
  const text = r.stderr ?? "";
  const m = /\{[\s\S]*?\}/.exec(text);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    return { i: numOrNull(j.input_i), tp: numOrNull(j.input_tp), lra: numOrNull(j.input_lra) };
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------- CLI ---

interface BenchCli {
  uid: string;
  /** --uid передан явно: в пилот-режимах фильтрует пул (прицельная перегенерация). */
  uidGiven: boolean;
  lang: string;
  /** Стартовая нумерация `{voice}__N` (2 — после базового файла); в пилоте не участвует (имя `{voice}__Vox`). */
  start: number;
  seed: number;
  /** Запустить только N-й прогон матрицы (1..14). */
  only?: number;
  /** Пилот: сколько РАЗНЫХ фраз сгенерировать (0 = режим матрицы). */
  picks: number;
  /** Режим «по голосу»: по perVoice фраз на КАЖДЫЙ голос пула (прослушка тембров). */
  eachVoice: boolean;
  /** Сколько фраз на голос в режиме --each-voice. */
  perVoice: number;
  /** Фильтр голосов (`--voice Sarah,Kate`, повторяемый); пусто = все голоса. */
  voices: string[];
  /**
   * Фильтр арки (`--arc Prologue`) — берём фразы только этой арки
   * (решение владельца 2026-10-28: «пролог фразы бери, зачем рандом»).
   * Работает с --picks/--each-voice; пусто = все арки.
   */
  arc: string;
  /**
   * Явный список фраз на перегенерацию (`--uids a,b,c` или `--uids @файл`,
   * элемент — `arc/uid__voice` как в `vox_qc.mts --rejects`; см. filterByUids).
   * Имплицирует пилот-режим ровно на этих фразах (picks = uids.length).
   */
  uids: string[];
  /**
   * Несколько seed'ов на каждый прогон (`--seeds 7,42,43`) — кандидаты
   * бок-о-байт: файлы `{имя}_s{seed}.wav`, судья `vox_qc.mts --rank/--pick`
   * отбирает лучшего. Пусто = один seed (--seed).
   */
  seeds: number[];
  /** Перебор списка cfg на одной фразе (напр. 2,2.25,2.5); пусто = матрица/пилот. */
  cfgs: number[];
  /** Конфиг пилота (по умолчанию = дефолты шима). */
  cfg: number;
  ts: number;
  /**
   * Оперативные переопределения кнобков на этот прогон (`--opt key=value`,
   * валидация по VOX_KNOBS): ложатся в genOpts поверх cfg/ts (поздние ключи
   * в объекте выигрывают) и в extra/имя файла (метка `_key=value`).
   */
  opts: Record<string, number | boolean>;
  /** Только напечатать справочник кнобков и выйти (`--knobs`). */
  knobs: boolean;
  dryRun: boolean;
  /**
   * Resume (планировщик очереди, задача 2026-10-30): пропуск фраз, чей
   * целевой файл УЖЕ есть (opus после инлайн-конвейера; wav при --raw) —
   * обрыв/остановка/ребут не теряют прогресс, повторный запуск продолжает
   * с места. Без флага — обычное поведение стенда (полная регенерация).
   */
  resume: boolean;
  /** Не удалять прошлые версии фразы (A/B-сравнение конфигов/эмоций). */
  keepPrev: boolean;
  /** Переопределение эмоции: стиль-префикс `(emotion)text` вместо POT-тона. */
  emotion: string;
  /** Метка в имени файла (A/B: проба не затирает основной файл). */
  nameTag: string;
  /** Без конвейера: оставить СЫРОЙ wav (не выравнивать, не конвертировать). */
  raw: boolean;
  /** Совсем без эмоции: голый текст, префикс (emotion) не подставляется. */
  noEmotion: boolean;
  /**
   * !!! ВЛАДЕЛЕЦ ОТКЛОНИЛ (2026-10-28): Hi-Fi нельзя совместить с
   * эмоциями (офиц.: control instruction нельзя с prompt_text), а эмоции —
   * контент нашей озвучки. Флаг спит; ASR-транскрипты остались как
   * полезность (ref_transcripts.json).
   * Hi-Fi Cloning (2026-10-28): prompt_wav + prompt_text (ASR-транскрипт
   * из tmp/voxcpm_bench/ref_transcripts.json) + reference — офиц. режим
   * наивысшей схожести голоса.
   */
  hifi: boolean;
}

export function parseBenchCli(argv: string[]): BenchCli {
  const o: BenchCli = {
    uid: TRAIN_UID,
    uidGiven: false,
    lang: "ru",
    start: 2,
    seed: 42,
    picks: 0,
    eachVoice: false,
    perVoice: 1,
    voices: [],
    arc: "",
    uids: [],
    seeds: [],
    cfgs: [],
    cfg: DEFAULT_CFG,
    ts: DEFAULT_TIMESTEPS,
    opts: {},
    knobs: false,
    dryRun: false,
    resume: false,
    keepPrev: false,
    emotion: "",
    nameTag: "",
    raw: false,
    noEmotion: false,
    hifi: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`нет значения у ${a}`);
      return v;
    };
    switch (a) {
      case "--uid":
        o.uid = next();
        o.uidGiven = true;
        break;
      case "--lang":
        o.lang = next();
        break;
      case "--start":
        o.start = Number(next());
        break;
      case "--seed":
        o.seed = Number(next());
        break;
      case "--only":
        o.only = Number(next());
        break;
      case "--picks":
        o.picks = Number(next());
        break;
      case "--each-voice":
        o.eachVoice = true;
        break;
      case "--per-voice":
        o.perVoice = Number(next());
        break;
      case "--voice":
        o.voices.push(
          ...next()
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
        break;
      case "--arc":
        o.arc = next();
        break;
      case "--uids": {
        const raw = next();
        // `@файл` — `arc/uid__voice` на строку (продукт `vox_qc.mts --rejects`),
        // иначе — список через запятую
        const src = raw.startsWith("@") ? readFileSync(raw.slice(1), "utf8") : raw;
        o.uids.push(
          ...src
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean),
        );
        break;
      }
      case "--seeds": {
        // несколько seed'ов -> кандидаты бок-о-байт `{имя}_s{seed}.wav`
        const list = next()
          .split(",")
          .map((s) => Number(s.trim()));
        if (list.some((n) => !Number.isInteger(n) || n < 0)) throw new Error("--seeds: ждём целые >= 0 через запятую");
        o.seeds.push(...list);
        break;
      }
      case "--cfgs": {
        const list = next()
          .split(",")
          .map((s) => Number(s.trim()));
        if (list.length === 0 || list.some((n) => !Number.isFinite(n) || n <= 0)) {
          throw new Error("--cfgs должен быть списком чисел > 0 через запятую");
        }
        o.cfgs = list;
        break;
      }
      case "--cfg":
        o.cfg = Number(next());
        break;
      case "--ts":
        o.ts = Number(next());
        break;
      case "--opt": {
        const [k, v] = parseOpt(next());
        o.opts[k] = v;
        break;
      }
      case "--knobs":
        o.knobs = true;
        break;
      case "--keep-prev":
        o.keepPrev = true;
        break;
      case "--emotion":
        o.emotion = next();
        break;
      case "--name-tag":
        o.nameTag = next().replace(/[^\w.-]/g, "_");
        break;
      case "--raw":
        o.raw = true;
        break;
      case "--no-emotion":
        o.noEmotion = true;
        break;
      case "--hifi":
        o.hifi = true;
        break;
      case "--dry-run":
        o.dryRun = true;
        break;
      case "--resume":
        o.resume = true;
        break;
      default:
        throw new Error(`неизвестная опция: ${a}`);
    }
  }
  if (!Number.isFinite(o.start) || o.start < 1) throw new Error("--start должен быть >= 1");
  if (o.only !== undefined && (!Number.isFinite(o.only) || o.only < 1)) throw new Error("--only должен быть >= 1");
  if (!Number.isFinite(o.picks) || o.picks < 0) throw new Error("--picks должен быть >= 0");
  if (!Number.isFinite(o.perVoice) || o.perVoice < 1) throw new Error("--per-voice должен быть >= 1");
  if (o.eachVoice && o.picks > 0) throw new Error("--each-voice не сочетается с --picks (выбери один режим)");
  if (o.arc && !o.eachVoice && o.picks === 0) {
    throw new Error("--arc работает только с --picks/--each-voice (в матрице роль играет --uid)");
  }
  if (o.voices.length > 0 && !o.eachVoice && o.picks === 0) {
    throw new Error("--voice работает только с --picks/--each-voice (в матрице роль играет --uid)");
  }
  if (o.cfgs.length > 0 && (o.picks > 0 || o.eachVoice)) {
    // раньше молча терялось: ветки пилота/по-голосового берут один o.cfg
    throw new Error("--cfgs работает только в матричном режиме (без --picks/--each-voice); для пилота есть --cfg");
  }
  if (!Number.isFinite(o.cfg) || o.cfg <= 0) throw new Error("--cfg должен быть > 0");
  if (!Number.isFinite(o.ts) || o.ts < 1) throw new Error("--ts должен быть >= 1");
  if (o.uids.length > 0) {
    // --uids = готовый список на перегенерацию: сам задаёт пилот-режим
    o.uids = [...new Set(o.uids)];
    if (o.eachVoice) throw new Error("--uids не сочетается с --each-voice");
    if (o.picks > 0) throw new Error("--uids не сочетается с --picks (uids сами задают объём)");
    if (o.uidGiven) throw new Error("--uids не сочетается с --uid (выбери один)");
    o.picks = o.uids.length;
  }
  if (o.noEmotion && o.emotion) throw new Error("--no-emotion не сочетается с --emotion (выбери один)");
  // имя файла обязано нести факт Hi-Fi (матричный режим тоже умеет nameTag)
  if (o.hifi && !o.nameTag) o.nameTag = "hifi";
  if (o.seeds.length > 0) {
    o.seeds = [...new Set(o.seeds)];
    if (o.seeds.length < 2) {
      // один seed не создаёт кандидатов — это обычный --seed
      throw new Error("--seeds: нужно минимум 2 разных seed'а (для одного используй --seed)");
    }
  }
  return o;
}

// ----------------------------------------------------------------- main ---

/** Один план-прогон: что и куда генерируем. */
interface PlanItem {
  n: number;
  /** База имени файла (без .wav). */
  name: string;
  wavPath: string;
  phrase: Phrase;
  cfg: number;
  ts: number;
  extra: Record<string, unknown>;
  /** Подпись в итоговой таблице: конфиг (матрица) или арка/голос (пилот). */
  who: string;
  /** Явный seed прогона (есть только при --seeds: кандидаты бок-о-байт). */
  seed?: number;
}

interface RunRecord {
  n: number;
  name: string;
  uid: string;
  arc: string;
  voice: string;
  cfg: number;
  ts: number;
  extra: Record<string, unknown>;
  seed: number;
  ok: boolean;
  durSec?: number;
  genSec?: number;
  loud?: Loudness | null;
  error?: string;
}

/** Форматирование числа в таблицу (null -> "-"). */
function fmt(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "-" : v.toFixed(digits);
}

/**
 * Фильтр пула по голосам (`--voice Sarah,Kate`, регистронезависимо). Неизвестный
 * голос = стоп со списком доступных: иначе опечатка молча дала бы пустой прогон.
 */
export function filterByVoices(phrases: Phrase[], voices: string[]): Phrase[] {
  if (voices.length === 0) return phrases;
  const known = [...new Set(phrases.map((p) => p.voice))];
  const unknown = voices.filter((v) => !known.some((k) => k.toLowerCase() === v.toLowerCase()));
  if (unknown.length > 0) {
    throw new Error(`--voice неизвестный голос: ${unknown.join(", ")}\nдоступно: ${known.toSorted().join(", ")}`);
  }
  const want = new Set(voices.map((v) => v.toLowerCase()));
  return phrases.filter((p) => want.has(p.voice.toLowerCase()));
}

/**
 * Фильтр пула по арке (`--arc Prologue`): владелец 2026-10-28 — для
 * сравнений берём фразы одной арки, а не случайную выборку.
 */
export function filterByArc(phrases: Phrase[], arc: string): Phrase[] {
  const out = phrases.filter((p) => p.arc.toLowerCase() === arc.toLowerCase());
  if (out.length === 0) {
    const arcs = [...new Set(phrases.map((p) => p.arc))].toSorted();
    throw new Error(`нет фраз в арке "${arc}" (lang). Доступно: ${arcs.join(", ")}`);
  }
  return out;
}

/**
 * Фильтр пула по списку на перегенерацию. Формат элемента (продукт
 * `vox_qc.mts --rejects`): `arc/uid__voice` | `uid__voice` | `uid`.
 *
 * uid = md5(ТЕКСТА) и на один текст приходится до 7 голосов/арок (проверено
 * 2026-10-27: 30 uid'ов -> 42 фразы) — голый uid перегенерировал бы чужой
 * файл. Поэтому без arc/voice элемент обязан дать ровно одно совпадение,
 * иначе стоп с перечнем кандидатов (уточняй `arc/uid__voice`).
 */
export function filterByUids(phrases: Phrase[], uids: string[]): Phrase[] {
  const out: Phrase[] = [];
  const missing: string[] = [];
  const ambiguous: string[] = [];
  for (const entry of uids) {
    const [arcPart, rest] = entry.includes("/") ? entry.split(/\/(.+)/) : [undefined, entry];
    const [uid, ...voiceParts] = rest.split("__");
    const voice = voiceParts.length > 0 ? voiceParts.join("__") : undefined;
    const hits = phrases.filter(
      (p) =>
        p.uid === uid && (arcPart === undefined || p.arc === arcPart) && (voice === undefined || p.voice === voice),
    );
    if (hits.length === 0) missing.push(entry);
    else if (hits.length > 1) {
      ambiguous.push(`"${entry}" -> ${hits.length} фраз: ${hits.map((h) => `${h.arc}/${h.voice}`).join(", ")}`);
    } else out.push(hits[0]);
  }
  if (missing.length > 0 || ambiguous.length > 0) {
    const msg: string[] = [];
    if (missing.length > 0) msg.push(`не найдено ${missing.length}:\n  ${missing.join("\n  ")}`);
    if (ambiguous.length > 0)
      msg.push(`неоднозначно ${ambiguous.length} (уточни arc/uid__voice):\n  ${ambiguous.join("\n  ")}`);
    throw new Error(msg.join("\n"));
  }
  return out;
}

/** Построение плана: матрица на одну фразу либо выборка N фраз (пилот). */
function planOnce(o: BenchCli, phrases: Phrase[]): PlanItem[] {
  if (o.eachVoice) {
    // По N фраз на КАЖДЫЙ голос: перемешиваем seed'ом и режем по perVoice,
    // чтобы голоса не выбирались всегда одной и той же «первой» фразой.
    const shuffled = selectSample(phrases, phrases.length, o.seed);
    const byVoice = new Map<string, Phrase[]>();
    for (const p of shuffled) {
      const list = byVoice.get(p.voice) ?? [];
      if (list.length < o.perVoice) {
        list.push(p);
        byVoice.set(p.voice, list);
      }
    }
    const tag = optTag(o.opts);
    // Имя хранит конфиг генерации (владелец 2026-10-27): {uid}__{voice}__Vox_cfg{X}
    // — по именам видно, на каком cfg что вышло, и копится статистика
    // «голос -> рабочий конфиг».
    const cfgTag = `_cfg${o.cfg.toFixed(1)}_ts${o.ts}`;
    const nt = o.nameTag ? `_${o.nameTag}` : "";
    return [...byVoice.values()].flat().map((p) => ({
      n: o.start,
      name: `${p.uid}__${p.voice}__Vox${cfgTag}${tag}${nt}`,
      wavPath: join(dirname(p.out), `${p.uid}__${p.voice}__Vox${cfgTag}${tag}${nt}.wav`),
      phrase: p,
      cfg: o.cfg,
      ts: o.ts,
      extra: { ...o.opts },
      who: `${p.arc}/${p.voice}`,
    }));
  }
  if (o.picks > 0) {
    const sample = selectSample(phrases, o.picks, o.seed);
    // Суффикс пилота — имя движка (не номер): пара {voice}.wav (Cosy) /
    // {voice}__Vox.wav (Vox) читается в папке без расшифровки (реш. 2026-10-27).
    // Метка --opt дописывается в конец, чтобы эксперимент не затёр предыдущий.
    const tag = optTag(o.opts);
    const cfgTag = `_cfg${o.cfg.toFixed(1)}_ts${o.ts}`; // имя хранит конфиг (см. --each-voice)
    const nt = o.nameTag ? `_${o.nameTag}` : "";
    return sample.map((p) => ({
      n: o.start,
      name: `${p.uid}__${p.voice}__Vox${cfgTag}${tag}${nt}`,
      wavPath: join(dirname(p.out), `${p.uid}__${p.voice}__Vox${cfgTag}${tag}${nt}.wav`),
      phrase: p,
      cfg: o.cfg,
      ts: o.ts,
      extra: { ...o.opts },
      who: `${p.arc}/${p.voice}`,
    }));
  }
  const one = phrases[0];
  const offset = o.only === undefined ? 0 : o.only - 1;
  // --cfgs: свой список конфигов вместо полной матрицы (одна фраза, общий ts)
  const all = o.cfgs.length > 0 ? o.cfgs.map((cfg) => ({ cfg, ts: o.ts, suffix: "", extra: {} })) : buildMatrix();
  const runs = o.only === undefined ? all : all.filter((_, i) => i === o.only! - 1);
  const tag = optTag(o.opts);
  return runs.map((run, i) => {
    const n = o.start + offset + i;
    const nt = o.nameTag ? `_${o.nameTag}` : "";
    const name = matrixName(one.uid, one.voice, n, run) + tag + nt;
    // --opt поверх точечных extra (поздний ключ объекта выигрывает)
    const extra = { ...run.extra, ...o.opts };
    const extraDesc = Object.entries(extra)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    return {
      n,
      name,
      wavPath: join(dirname(one.out), `${name}.wav`),
      phrase: one,
      cfg: run.cfg,
      ts: run.ts,
      extra,
      who: `cfg${fmtCfg(run.cfg)}/ts${run.ts}${extraDesc ? ` (${extraDesc})` : ""}`,
    };
  });
}

/**
 * План стенда. `--seeds 7,42,43` размножает каждый прогон в кандидатов
 * бок-о-байт: `{имя}_s{seed}.wav` + явный seed в PlanItem (см. поле seed) —
 * дальше `vox_qc.mts --rank/--pick` отбирает лучшего, победитель копируется
 * в каноническое `{uid}__{voice}__Vox.wav`.
 */
/**
 * --resume (очередь vox_queue.mts, задача 2026-10-30): какие фразы ПРОПУСТИТЬ,
 * т.к. их целевой файл уже есть. Цель = opus после инлайн-конвейера (файл
 * создаётся сразу), либо сырой wav при --raw. Чистая функция: `exists` внедряется
 * снаружи — тесты ходят без ФС.
 */
export function filterDone<T extends { wavPath: string }>(
  items: T[],
  raw: boolean,
  exists: (path: string) => boolean = existsSync,
): { kept: T[]; skipped: number } {
  const kept = items.filter((it) => !exists(raw ? it.wavPath : opusPathFor(it.wavPath)));
  return { kept, skipped: items.length - kept.length };
}

export function buildPlan(o: BenchCli, phrases: Phrase[]): PlanItem[] {
  const base = planOnce(o, phrases);
  if (o.seeds.length === 0) return base;
  return base.flatMap((it) =>
    o.seeds.map((seed) => ({
      ...it,
      seed,
      name: `${it.name}_s${seed}`,
      wavPath: join(dirname(it.wavPath), `${it.name}_s${seed}.wav`),
    })),
  );
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const o = parseBenchCli(argv);
  if (o.knobs) {
    // Справка кнобков — до загрузки каталога/модели (оперативный режим)
    console.log(knobsText());
    return 0;
  }
  const engine = ENGINES.voxcpm2;
  const args: Args = {
    lang: o.lang,
    seed: o.seed,
    force: true,
    dryRun: false,
    noEmotion: false,
    keepWav: false,
    wavOnly: false,
    emotionTag: "",
    device: "cuda",
    python: engine.python,
    engine: "voxcpm2",
    // --uid: в матрице — всегда (дефолт = тренировочная фраза); в пилот/по-голосовом
    // — только если передан явно (прицельная перегенерация одной фразы);
    // --uids в каталог НЕ передаётся (элементы `arc/uid__voice` каталог не знает) —
    // фильтруется ниже через filterByUids по полному пулу
    ...(o.uids.length > 0 ? {} : o.uidGiven || (!o.eachVoice && o.picks === 0) ? { uid: [o.uid] } : {}),
  };
  let phrases: Phrase[];
  try {
    let pool = filterByVoices(selectPhrases(loadCatalog(o.lang), args), o.voices);
    if (o.arc) pool = filterByArc(pool, o.arc);
    phrases = o.uids.length > 0 ? filterByUids(pool, o.uids) : pool;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
  if (phrases.length === 0) {
    console.error(
      `нет фраз под выборку (lang=${o.lang}${o.picks > 0 || o.eachVoice ? "" : `, uid=${o.uid}`}${
        o.voices.length > 0 ? `, voices=${o.voices.join("/")}` : ""
      }) — проверь uid/голоса/реф/перевод`,
    );
    return 1;
  }
  if (o.picks === 0 && !o.eachVoice && phrases.length !== 1) {
    console.error(`фраза ${o.uid} (lang=${o.lang}) найдена неоднозначно: ${phrases.length} совпадений`);
    return 1;
  }
  if ((o.picks > 0 || o.eachVoice) && o.uidGiven && phrases.length !== 1) {
    // uid в выборочном режиме обязан указывать на одну фразу — иначе имя
    // {uid}__{voice}__Vox неоднозначно
    console.error(`--uid ${o.uid} в выборочном режиме: найдено ${phrases.length} фраз (нужна ровно 1)`);
    return 1;
  }
  let plan = buildPlan(o, phrases);
  if (plan.length === 0) {
    console.error(`план пуст: --only=${o.only ?? "-"} / --picks=${o.picks} (кандидатов ${phrases.length})`);
    return 1;
  }
  if (o.resume) {
    // Обрыв/остановка/ребут: готовые opus не трогаем — продолжаем с места.
    const { kept, skipped } = filterDone(plan, o.raw);
    plan = kept;
    console.log(`resume: пропущено готовых ${skipped}, в работе ${plan.length}`);
    if (plan.length === 0) {
      console.log(`resume: всё уже сгенерировано (${skipped}) — генерировать нечего`);
      return 0;
    }
    plan.forEach((it, i) => (it.n = i + 1)); // сквозная нумерация остатка
  }

  const mode =
    o.uids.length > 0
      ? `перегенерация списка (--uids: ${o.uids.length} фраз)`
      : o.eachVoice
        ? `по голосу (${o.perVoice} фр./голос${o.voices.length > 0 ? `, ${o.voices.length} голос(ов)` : ", все голоса"})`
        : o.picks > 0
          ? "пилот (разные фразы)"
          : o.cfgs.length > 0
            ? "подбор cfg (одна фраза)"
            : "матрица (одна фраза)";
  const cfgDesc = o.cfgs.length > 0 ? `cfg ${o.cfgs.join("/")}/ts${o.ts}` : `cfg${fmtCfg(o.cfg)}/ts${o.ts}`;
  const seedDesc = o.seeds.length > 0 ? `seeds=${o.seeds.join(",")}` : `seed=${o.seed}`;
  const nameDesc =
    !o.eachVoice && o.picks === 0 ? `нумерация {voice}__ с ${o.start}` : "имя {uid}__{voice}__Vox_cfg{cfg}_ts{ts}";
  const optDesc = Object.keys(o.opts).length > 0 ? ` | --opt: ${optTag(o.opts).slice(1)}` : "";
  console.log(
    `стенд VoxCPM2 [${mode}]: lang=${o.lang}, прогонов=${plan.length}, ` +
      `конфиг ${cfgDesc}, ${seedDesc}, ${nameDesc}${optDesc}`,
  );
  if (o.picks === 0 && !o.eachVoice)
    console.log(
      `  фраза: ${plan[0].phrase.uid} | ${plan[0].phrase.text.length} симв. | тон: ${o.noEmotion ? "(БЕЗ ЭМОЦИИ)" : ((o.emotion || plan[0].phrase.emotion) ?? "(нет)")}`,
    );
  for (const it of plan) {
    console.log(`  ${String(it.n).padStart(2)}. ${it.name}  [${it.who}]`);
  }
  if (o.dryRun) return 0;

  // Hi-Fi: ASR-транскрипты рефов (tmp/voxcpm_bench/ref_transcripts.json) —
  // валидация ДО загрузки модели: нет текста голоса -> стоп с перечнем
  let transcripts: Record<string, { text?: string }> = {};
  if (o.hifi) {
    const tp = join(REPO_ROOT, "tmp", "voxcpm_bench", "ref_transcripts.json");
    try {
      transcripts = JSON.parse(readFileSync(tp, "utf8"));
    } catch {
      console.error(`нет транскриптов ${tp} — запусти asr_refs.py (--cast <Имя>)`);
      return 1;
    }
    const missing = [...new Set(plan.map((it) => it.phrase.voice))].filter((v) => !transcripts[v]?.text);
    if (missing.length > 0) {
      console.error(`--hifi: нет транскрипта для голоса(ов): ${missing.join(", ")} — asr_refs.py --cast <Имя>`);
      return 1;
    }
  }

  const w = new VoiceWorker({
    python: engine.python,
    script: engine.shim,
    onLog: (l) => console.log(`  [shim] ${l}`),
  });
  const records: RunRecord[] = [];
  // Vox-стандарт (владелец 2026-10-28): OpusHead 48000 Hz, битрейт 24 kbps
  const VOX_HZ = 48_000;
  // Ошибки инлайн-конвейера (level/opus) — отчёт в конце прогона
  const convErrs: string[] = [];
  try {
    const tLoad = Date.now();
    const ping = await w.ping();
    if (!ping.ok) throw new Error(ping.error ?? "ping failed");
    console.log(`модель загружена за ${((Date.now() - tLoad) / 1000).toFixed(1)}с`);

    for (const it of plan) {
      // Имя хранит конфиг: при обычном прогоне (без --seeds) убираем прошлые
      // версии {uid}__{voice}__Vox* (другой cfg/seed) — в папке остаётся только
      // актуальная попытка, статистика «голос -> cfg» читается по именам.
      if (!o.keepPrev && o.seeds.length === 0 && (o.picks > 0 || o.eachVoice)) {
        const dir = dirname(it.wavPath);
        if (!existsSync(dir)) {
          // папки ещё нет (первый прогон нового языка) — чистить нечего (бага 2026-10-28)
        } else {
          const prefix = `${it.phrase.uid}__${it.phrase.voice}__Vox`;
          const self = basename(it.wavPath);
          for (const f of readdirSync(dir)) {
            if (f.startsWith(prefix) && f.endsWith(".wav") && f !== self) rmSync(join(dir, f), { force: true });
          }
        }
      }
      // --seeds: у кандидатов свой seed, иначе общий seed стенда
      const seed = it.seed ?? o.seed;
      const rec: RunRecord = {
        n: it.n,
        name: it.name,
        uid: it.phrase.uid,
        arc: it.phrase.arc,
        voice: it.phrase.voice,
        cfg: it.cfg,
        ts: it.ts,
        extra: it.extra,
        seed,
        ok: false,
      };
      // eslint-disable-next-line no-await-in-loop -- последовательно: одна GPU, один прогон за раз
      const r = await w.generateRaw({
        text: it.phrase.text,
        ref: it.phrase.ref,
        emotion: o.noEmotion ? null : o.emotion || it.phrase.emotion,
        ...(o.hifi ? { prompt_text: transcripts[it.phrase.voice]?.text ?? null } : {}),
        seed,
        out: it.wavPath,
        genOpts: { cfg_value: it.cfg, inference_timesteps: it.ts, ...it.extra, seed },
      });
      if (!r.ok || !r.samples || r.sr === undefined) {
        rec.error = r.error ?? "пустой PCM";
        records.push(rec);
        console.log(`  ${String(it.n).padStart(2)}. FAIL ${it.name}: ${rec.error}`);
        continue;
      }
      const durSec = r.samples.length / r.sr;
      rec.durSec = Math.round(durSec * 100) / 100;
      rec.genSec = Math.round(((r.genMs ?? 0) / 1000) * 10) / 10;
      // СЫРОЙ wav (без trim/фильтров): уровень выравнивается КОНВЕЙЕРОМ ниже
      mkdirSync(dirname(it.wavPath), { recursive: true }); // <lang> может не существовать
      writeWav16(it.wavPath, r.samples, r.sr);
      rec.loud = measureLoudness(it.wavPath);
      rec.ok = true;
      records.push(rec);
      console.log(
        `  ${String(it.n).padStart(2)}. ${it.name}: ${rec.durSec.toFixed(2)}с, gen ${rec.genSec}с, ` +
          `I ${fmt(rec.loud?.i)} LUFS, TP ${fmt(rec.loud?.tp)} dBTP, LRA ${fmt(rec.loud?.lra)} LU`,
      );
      // КОНВЕЙЕР СРАЗУ после записи (владелец 2026-10-30): wav -> выравнивание
      // (-16/TP-1.5) -> opus 48k/24k -> удаление wav. Не копим пачку wav
      // (~10x места на диске), обрыв оставляет максимум один недоконвертированный
      // wav вместо сотен; --raw — сырой wav остаётся (отладка/эксперименты).
      if (!o.raw) {
        if (!normalizeWav(it.wavPath, VOX_HZ)) {
          convErrs.push(`level:${it.name}`);
        } else if (!wavToOpus(it.wavPath, VOX_HZ)) {
          convErrs.push(`opus:${it.name}`);
        } else {
          rmSync(it.wavPath, { force: true });
        }
      }
    }
  } finally {
    await w.quit().catch(() => w.kill());
  }

  mkdirSync(BENCH_DIR, { recursive: true });
  writeFileSync(join(BENCH_DIR, "last.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  // Накопительный журнал СКОРОСТЕЙ (владелец 2026-10-27): cfg/ts/genSec на каждую генерацию
  appendFileSync(
    join(BENCH_DIR, "gen_times.jsonl"),
    records
      .map((r) =>
        JSON.stringify({
          at: new Date().toISOString(),
          seed: r.seed,
          cfg: r.cfg,
          ts: r.ts,
          genSec: r.genSec,
          durSec: r.durSec,
          name: r.name,
        }),
      )
      .join("\n") + "\n",
  );

  // Инлайн-конвейер живёт в главном цикле (см. выше): wav -> уровень -> opus ->
  // удаление wav — сразу после каждой фразы; пачка wav не накапливается.
  if (convErrs.length > 0) {
    console.log(`\nконвейер: ошибок ${convErrs.length}: ${convErrs.slice(0, 5).join(", ")}`);
  }

  const ok = records.filter((r) => r.ok);
  console.log(`\n=== ИТОГ: ${ok.length}/${records.length} прогонов ===`);
  console.log("N  | кто                      | дл.,с | ген,с | I LUFS | TP    | LRA | файл");
  for (const r of records) {
    const who = o.eachVoice || o.picks > 0 ? `${r.arc}/${r.voice}` : `cfg${fmtCfg(r.cfg)}/ts${r.ts}`;
    console.log(
      `${String(r.n).padStart(2)} | ${who.padEnd(24)} | ${fmt(r.durSec, 2).padStart(5)} | ` +
        `${fmt(r.genSec).padStart(5)} | ${fmt(r.loud?.i).padStart(6)} | ${fmt(r.loud?.tp).padStart(5)} | ` +
        `${fmt(r.loud?.lra).padStart(3)} | ${r.ok ? r.name : `FAIL: ${r.error}`}`,
    );
  }
  const nameEx =
    !o.eachVoice && o.picks === 0 ? `{arc}/{uid}__{voice}__${o.start}[_cfg…].wav` : "{arc}/{uid}__{voice}__Vox.wav";
  console.log(`\nфайлы: ${nameEx} | журнал: tmp/voxcpm_bench/last.jsonl`);
  return ok.length === 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
