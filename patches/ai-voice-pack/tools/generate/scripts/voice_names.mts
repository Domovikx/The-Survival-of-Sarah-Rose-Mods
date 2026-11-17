/**
 * voice_names.mts — имя файла озвучки: `{en12}-{state6} {variant}.opus`.
 *
 *  en12    — base32(md5(английский оригинал)[:8])[:12]                 «какая это реплика», 60 бит
 *  state6  — base32(md5(канонический JSON {emotion, text})[:4])[:6]     «что произносится», 30 бит
 *  variant — имя голоса как есть (Sarah, Sarah_1, King Orwell Rose)
 *
 * Алфавит — base32 RFC4648 (A-Z2-7): только верхний регистр, поэтому имя
 * регистронезависимо безопасно (Windows/macOS), и кодировщик есть родной и в
 * Node (`Buffer`-независимый, см. ниже), и в Python/Ren'Py (`base64.b32encode`) —
 * паритет стережёт тест.
 *
 * Порядок как в hex-схеме: спереди два ФИКСИРОВАННЫХ хэша (разбор однозначен),
 * человекочитаемый голос — в хвосте. Правка перевода или тона меняет средний
 * сегмент → файл устарел; правка оригинала меняет префикс → это другая реплика.
 *
 * Длины обоснованы замерами (docs/voice-naming.md, tasks/2026-11-17-voice-names-base32.md):
 *  - en12 (60 бит): 0 коллизий на 67 365 реальных текстах; ёмкость 1.5 млн фраз
 *    (при «1 коллизия на миллион»); в микро-фразах (≤12 симв., 1 919 разных) — 0;
 *  - state6 (30 бит): 0.0001 ожидаемых «молча устаревших» на 64 972 реальных
 *    правках перевода (state4 дал бы 0.062, state5 — 0.0019).
 */
import { createHash } from "node:crypto";

/** Разделитель между хэшами; перед вариантом — пробел (читаемость). */
export const NAME_SEP = "-";
export const VARIANT_SEP = " ";
export const EN_HASH_LEN = 12;
export const STATE_HASH_LEN = 6;
export const VOICE_EXT = "opus";

/** Алфавит base32 RFC4648 — тот же, что `base64.b32encode` в Python. */
export const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const md5 = (s: string): Buffer => createHash("md5").update(s, "utf8").digest();
const md5hex = (s: string): string => createHash("md5").update(s, "utf8").digest("hex");

/**
 * Первые `chars` символов base32 RFC4648 от начала буфера.
 * Биты пакуются старшими вперёд, как в RFC4648 — отсюда побайтовый паритет
 * с `base64.b32encode(hashlib.md5(...).digest()[:N]).decode()`.
 */
const base32 = (buf: Buffer, chars: number): string => {
  let out = "";
  let acc = 0;
  let bits = 0;
  for (const byte of buf) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < chars) {
      out += BASE32_ALPHABET[(acc >> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length >= chars) break;
  }
  return out;
};

/** Хэш реплики: от английского оригинала (60 бит). */
export const enHash = (en: string): string => base32(md5(en).subarray(0, 8), EN_HASH_LEN);

/**
 * Текст, который реально читает голос: NFC, без Ren'Py-разметки `{…}` и подстановок
 * `[…]`, без лишних пробелов, без осиротевшей пунктуации в начале (остаток от
 * вырезанной переменной). Хэшируется ИМЕННО он, поэтому косметика po (пробелы,
 * теги) не вызывает переозвучку.
 */
export const ttsText = (raw: string): string =>
  raw
    .normalize("NFC")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:…])/g, "$1")
    .replace(/^[\s—–\-,;:]+/, "")
    .trim();

/**
 * Канонический JSON аудио-идентичности: ключи по алфавиту, без пробелов, без
 * \u-эскейпов (кириллица/иероглифы как есть). Канон критичен: без него
 * `{emotion, text}` и `{text, emotion}` дали бы разные хэши.
 *
 * Поля (и только они) — страж в тесте: новый вход, влияющий на звук, обязан
 * появиться здесь, иначе файл «актуален» при другом звуке.
 */
export const audioIdentity = (text: string, emotion?: string | null): Record<string, string> => ({
  emotion: emotion ?? "",
  text,
});

/** Каноническая строка (то, что хэшируется). Вынесена для логов/отладки. */
export const canonicalIdentity = (json: Record<string, string>): string =>
  `{${Object.keys(json)
    .toSorted()
    .map((k) => `${JSON.stringify(k)}:${JSON.stringify(json[k])}`)
    .join(",")}}`;

/**
 * Хэш состояния: «что произносится» — очищенный текст + тон. Отсутствие тона и
 * пустая строка — одно состояние (30 бит).
 */
export const stateHash = (spoken: string, emotion?: string | null): string =>
  base32(md5(canonicalIdentity(audioIdentity(ttsText(spoken), emotion))).subarray(0, 4), STATE_HASH_LEN);

// --------------------------------------------------------------- переход ---

/**
 * Хэши ПРЕДЫДУЩЕЙ схемы (`{en16}__{state8}__{variant}`). Живут только для
 * перехода: их читает `voice_migrate` (переименование) и `voice_stale` (аудит
 * до миграции). Новый код обязан пользоваться `enHash`/`stateHash`.
 */
export const HEX_EN_LEN = 16;
export const HEX_STATE_LEN = 8;

/** en16 старой схемы. */
export const hexEnHash = (en: string): string => md5hex(en).slice(0, HEX_EN_LEN);

/** Полный md5 (32 hex) — ключ легаси-имён `{uid32}__{variant}`. */
export const md5Hex = (s: string): string => md5hex(s);

/** state8 старой схемы. */
export const hexStateHash = (spoken: string, emotion?: string | null): string =>
  md5hex(canonicalIdentity(audioIdentity(ttsText(spoken), emotion))).slice(0, HEX_STATE_LEN);

// -------------------------------------------------------------- санитайз ---

/** Запрещённые в именах Windows символы. */
const FORBIDDEN = /[<>:"/\\|?*]/g;

/**
 * Управляющие символы (U+0000–U+001F, U+007F) в имени файла недопустимы.
 * Фильтруем по коду, а не регексом: правило no-control-regex справедливо ругается
 * на классы вида [\u0000-\u001f].
 */
const stripControl = (s: string): string =>
  [...s]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join("");

/**
 * Приводит имя голоса к безопасному виду: убирает недопустимые символы, срезает
 * точки/пробелы по краям (Windows молча их отбрасывает — имя молча же и
 * разойдётся). Пробелы и дефисы внутри разрешены: вариант стоит последним и
 * отделён пробелом после `state6`, поэтому разбор однозначен.
 */
export const sanitizeVariant = (variant: string): string =>
  stripControl(variant)
    .replace(FORBIDDEN, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "");

/** Максимальная длина варианта: имя целиком не должно упираться в MAX_PATH. */
export const MAX_VARIANT = 40;

export interface VoiceNameParts {
  en: string;
  variant: string;
  spoken: string;
  emotion?: string | null;
}

/** Собрать базовое имя (без расширения) — генератору нужен .wav, миграции .opus. */
export const voiceBase = ({ en, variant, spoken, emotion }: VoiceNameParts): string => {
  if (!en.trim()) throw new Error("пустой английский оригинал");
  if (!ttsText(spoken)) throw new Error("пустой текст озвучки (непереведённая строка?)");
  const v = sanitizeVariant(variant);
  if (!v) throw new Error("пустое имя голоса после очистки");
  if (v.length > MAX_VARIANT) throw new Error(`имя голоса длиннее ${MAX_VARIANT}: ${v.length}`);
  return `${enHash(en)}${NAME_SEP}${stateHash(spoken, emotion)}${VARIANT_SEP}${v}`;
};

/** Полное имя файла озвучки (по умолчанию .opus). */
export const voiceFileName = (parts: VoiceNameParts): string => `${voiceBase(parts)}.${VOICE_EXT}`;

// ---------------------------------------------------------------- разбор ---

/** Какой схемой записано имя. */
export type VoiceScheme = "base32" | "hex" | "uid32";

export interface ParsedVoiceName {
  scheme: VoiceScheme;
  /** Префикс реплики: en12 (base32), en16 (hex) или uid32 (легаси, полный md5). */
  en: string;
  /** Хэш состояния; `null` — схема его не хранит (uid32). */
  state: string | null;
  variant: string;
}

/**
 * Разбор однозначен: фиксированный en12, `-`, фиксированный state6, пробел,
 * остальное — вариант. Вариант может содержать и пробелы, и дефисы (они стоят
 * ПОСЛЕ пробела-разделителя).
 */
const BASE32_RE = new RegExp(
  `^([A-Z2-7]{${EN_HASH_LEN}})${NAME_SEP}([A-Z2-7]{${STATE_HASH_LEN}})${VARIANT_SEP}(.+)\\.(?:opus|wav)$`,
);

/** Разобрать имя НОВОЙ схемы. null — это не она (hex-переход/легаси/чужой формат). */
export const parseVoiceName = (name: string): ParsedVoiceName | null => {
  const m = BASE32_RE.exec(name);
  if (!m) return null;
  return { scheme: "base32", en: m[1]!, state: m[2]!, variant: m[3]! };
};

/** Имя предыдущей схемы `{en16}__{state8}__{variant}` (только период миграции). */
const HEX_RE = new RegExp(`^([0-9a-f]{${HEX_EN_LEN}})__([0-9a-f]{${HEX_STATE_LEN}})__(.+)\\.(?:opus|wav)$`);

/** Имя легаси-схемы `{uid32}__{variant}` (состояние неизвестно). */
const UID32_RE = /^([0-9a-f]{32})__(.+)\.(?:opus|wav)$/;

/** Разобрать имя любой из трёх схем. null — не имя озвучки вовсе. */
export const parseAnyVoiceName = (name: string): ParsedVoiceName | null => {
  const modern = parseVoiceName(name);
  if (modern) return modern;
  const hex = HEX_RE.exec(name);
  if (hex) return { scheme: "hex", en: hex[1]!, state: hex[2]!, variant: hex[3]! };
  const legacy = UID32_RE.exec(name);
  if (legacy) return { scheme: "uid32", en: legacy[1]!, state: null, variant: legacy[2]! };
  return null;
};

/**
 * Почему файл устарел: `null` — актуален, иначе причина.
 * «Чужой голос» — это не устаревание, а другой вариант (A/B); отдельная причина,
 * иначе чистка снесла бы живой A/B-дубль.
 */
export const staleReason = (
  name: string,
  expected: { variant: string; state: string },
): "legacy" | "state" | "variant" | null => {
  const parsed = parseVoiceName(name);
  if (!parsed) return "legacy";
  if (parsed.variant !== sanitizeVariant(expected.variant)) return "variant";
  if (parsed.state !== expected.state) return "state";
  return null;
};

/** Устарел ли файл по состоянию (перевод/тон). Чужой голос устаревшим не считается. */
export const isStale = (name: string, expected: { variant: string; state: string }): boolean => {
  const reason = staleReason(name, expected);
  return reason === "legacy" || reason === "state";
};
