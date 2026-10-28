/**
 * voice_presets.mts — единая карта конфигов озвучки TSSR (ИСТОЧНИК ИСТИНЫ).
 *
 * Лежит рядом со скриптами пайплайна (tools/generate/scripts/), которые её
 * едят; до миграции 2026-10-21 была config/voice_presets.yaml в корне репы
 * (файл и папка удалены — дублей не оставляем). Потребители:
 *   - TS-тулы: импорт секций напрямую или через scripts/config.mts
 *     (типизированные load/section/get);
 *   - python-тулы (пока живы): voicekit/config.py дергает JSON-дамп
 *     `node voice_presets.mts` (см. paths.PRESETS_MTS) и кэширует ответ.
 *
 * Правка значения = правка этого файла (коммитится как обычный TS).
 * Потребители хранят ФОЛБЭК-дефолты на случай недоступности node/модуля.
 */
import { fileURLToPath } from "node:url";

/** Единый стандарт уровня (рефы, кандидаты, реплики). */
export const AUDIO = {
  sr: 24000,
  loudness: {
    i: -16.0, // EBU R128 integrated, LUFS
    tp: -1.5, // true peak, dB
    lra: 11.0, // loudness range
  },
} as const;

/** Подготовка рефа (add_candidate: первые N секунд + чистка). */
export const REFS = {
  target_len: 10.0, // первые секунд рефа
  silence_db: -45.0, // порог тишины для анализа (dBFS)
  pause_compress: {
    // СЖАТИЕ пауз (обязательно для всех рефов)
    max: 0.35, // все паузы длиннее этой — сжимаем до target, с
    target: 0.35, // целевая длина паузы после сжатия, с
  },
} as const;

/** Генерация кандидатов (voice_design, VoiceDesign). */
export const DESIGN = {
  candidates: 6, // сколько кандидатов на персонажа (--n по умолчанию)
  // ВАЖНО (владелец, 2026-10-27): никаких указаний темпа/скорости в промтах —
  // темп — художественный замысел модели, его нельзя навязывать
  min_text_len: 150, // мин. длина фразы в texts (≈10с речи)
  max_text_len: 250, // макс: длиннее — риск дрейфа голоса
  temperature: 0.9, // ЕДИНАЯ конфигурация семплирования на всех кандидатов
  top_p: 0.9,
} as const;

/** Генерация реплик (voice_batch, CosyVoice3). */
export const BATCH = {
  flow_temp: 0.8, // официальный параметр модели (было 1.2 — артефакты)
  cfg_rate: 0.7, // официальный (было 0.9)
  sampling: [0.8, 25.0, 0.1], // RAS: top_p, top_k, tau_r (официальные)
  seed: 42,
  instruct_presets: {
    // --emotion пресеты (англ. описания состояний);
    // пресеты fast/slow УДАЛЕНЫ (владелец 2026-10-27): темп не задаём никогда
    angry: "In a fit of rage, with intensity",
    sad: "Sadly, with melancholic tone",
    happy: "Happily, with excitement",
    loud: "As loudly as possible",
    soft: "In a very soft voice",
    whisper: "In a soft whisper",
    russian: "Please speak in Russian, with a natural native accent",
  },
} as const;

/** Нелюдские голоса (beastify): k = множитель pitch, chain = ffmpeg-фильтры. */
export const BEASTIFY = {
  orc: {
    k: 0.84,
    chain:
      "bass=g=4:f=120,highshelf=f=4000:g=-8,acompressor=threshold=-25dB:ratio=3:attack=5:release=80,acrusher=bits=12:mode=log:aa=1",
    sub_hz: 75,
    sub_vol: 0.08,
    sub_trem: 18,
  },
  orc_deep: {
    k: 0.8,
    chain:
      "bass=g=5:f=120,highshelf=f=3500:g=-9,acompressor=threshold=-25dB:ratio=3:attack=5:release=80,acrusher=bits=11:mode=log:aa=1",
    sub_hz: 68,
    sub_vol: 0.11,
    sub_trem: 14,
  },
  orc_grunt: {
    k: 0.87,
    chain:
      "bass=g=3:f=130,highshelf=f=4500:g=-6,acrusher=bits=10:mode=log:aa=1,acompressor=threshold=-22dB:ratio=2.5:attack=5:release=60",
    sub_hz: 80,
    sub_vol: 0.06,
    sub_trem: 22,
  },
  orc_beast: {
    k: 0.82,
    chain: "bass=g=6:f=130,highshelf=f=3000:g=-9,acrusher=bits=8:mode=log:aa=1,aecho=0.7:0.85:250:0.25",
    sub_hz: 62,
    sub_vol: 0.13,
    sub_trem: 16,
  },
  // заготовки на будущее
  demon: {
    k: 0.78,
    chain: "tremolo=f=6:d=0.25,highshelf=f=3000:g=-10,acrusher=bits=10:mode=log:aa=1,aecho=0.8:0.9:700:0.4",
    sub_hz: 55,
    sub_vol: 0.1,
    sub_trem: 9,
  },
  monster: {
    k: 0.8,
    chain: "bass=g=6:f=130,highshelf=f=3000:g=-9,acrusher=bits=8:mode=log:aa=1,aecho=0.7:0.85:350:0.3",
    sub_hz: 65,
    sub_vol: 0.12,
    sub_trem: 14,
  },
  goblin: {
    k: 0.92,
    chain:
      "bandpass=f=1200:width_type=h:w=800,highshelf=f=3500:g=-6,acrusher=bits=10:mode=log:aa=1,acompressor=threshold=-20dB:ratio=2:attack=3:release=40",
    sub_hz: 0,
    sub_vol: 0,
    sub_trem: 0,
  },
  goblin_nasal: {
    k: 0.9,
    chain:
      "bandpass=f=1800:width_type=h:w=600,highshelf=f=4000:g=-8,acrusher=bits=9:mode=log:aa=1,aphaser=type=t:speed=0.5:decay=0.4",
    sub_hz: 0,
    sub_vol: 0,
    sub_trem: 0,
  },
  goblin_chitter: {
    k: 0.88,
    chain: "bandpass=f=1500:width_type=h:w=700,highshelf=f=3800:g=-7,acrusher=bits=11:mode=log:aa=1,tremolo=f=12:d=0.3",
    sub_hz: 0,
    sub_vol: 0,
    sub_trem: 0,
  },
} as const;

/** Весь конфиг (ключи секций: audio/refs/design/batch/beastify). */
export const VOICE_PRESETS = {
  audio: AUDIO,
  refs: REFS,
  design: DESIGN,
  batch: BATCH,
  beastify: BEASTIFY,
} as const;

export type VoicePresets = typeof VOICE_PRESETS;

// CLI: node voice_presets.mts -> JSON-дамп всего конфига.
// Мост для python-потребителей (voicekit/config.py, пока живы).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(VOICE_PRESETS));
}
