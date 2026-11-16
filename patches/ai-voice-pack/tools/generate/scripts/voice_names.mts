/**
 * voice_names.mts — имя файла озвучки: `{en16}__{state8}__{variant}.opus`.
 *
 *  en16    — md5(английский оригинал)[:16]                     «какая это реплика», 64 бита
 *  state8  — md5(канонический JSON {emotion, text})[:8]        «что произносится», 32 бита
 *  variant — имя голоса как есть (Sarah, Sarah_1, Narrator)
 *
 * Порядок выбран не случайно: спереди два ФИКСИРОВАННЫХ хэша (разбор однозначен),
 * человекочитаемый голос — в хвосте, там же где был: `…__Sarah.opus`. Правка
 * перевода или тона меняет средний сегмент → файл устарел; правка оригинала
 * меняет префикс → это уже другая реплика.
 *
 * Длины обоснованы замерами (docs/voice-naming.md):
 *  - en16 (64 бита): 0 коллизий на 68 113 реальных реплик; выдерживает 192 млн фраз;
 *  - state8 (32 бита): 0 промахов на 63 877 реальных правок перевода.
 */
import { createHash } from "node:crypto";

export const NAME_SEP = "__";
export const EN_HASH_LEN = 16;
export const STATE_HASH_LEN = 8;
export const VOICE_EXT = "opus";

const md5 = (s: string): string => createHash("md5").update(s, "utf8").digest("hex");

/** Хэш реплики: от английского оригинала. */
export const enHash = (en: string): string => md5(en).slice(0, EN_HASH_LEN);

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
 * пустая строка — одно состояние.
 */
export const stateHash = (spoken: string, emotion?: string | null): string =>
  md5(canonicalIdentity(audioIdentity(ttsText(spoken), emotion))).slice(0, STATE_HASH_LEN);

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
 * Приводит имя голоса к безопасному виду: убирает недопустимые символы, схлопывает
 * `__` (иначе разбор имени неоднозначен), срезает точки/пробелы по краям
 * (Windows молча их отбрасывает — имя молча же и разойдётся).
 */
export const sanitizeVariant = (variant: string): string =>
  stripControl(variant)
    .replace(FORBIDDEN, "")
    .trim()
    .replace(/(?:__)+/g, "_")
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
  return `${enHash(en)}${NAME_SEP}${stateHash(spoken, emotion)}${NAME_SEP}${v}`;
};

/** Полное имя файла озвучки (по умолчанию .opus). */
export const voiceFileName = (parts: VoiceNameParts): string => `${voiceBase(parts)}.${VOICE_EXT}`;

export interface ParsedVoiceName {
  en16: string;
  state8: string;
  variant: string;
}

/**
 * Разбор однозначен: фиксированный en16, фиксированный state8, затем всё
 * остальное — вариант (он не может содержать `__`, sanitizeVariant схлопывает).
 * Легаси `{md5-32}__{variant}.opus` не разбирается → null.
 */
const NAME_RE = new RegExp(`^([0-9a-f]{${EN_HASH_LEN}})__([0-9a-f]{${STATE_HASH_LEN}})__(.+)\\.(?:opus|wav)$`);

/** Разобрать имя. null — это не имя новой схемы (легаси/чужой формат). */
export const parseVoiceName = (name: string): ParsedVoiceName | null => {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  return { en16: m[1]!, state8: m[2]!, variant: m[3]! };
};

/**
 * Почему файл устарел: `null` — актуален, иначе причина.
 * «Чужой голос» — это не устаревание, а другой вариант (A/B); отдельная причина,
 * иначе чистка снесла бы живой A/B-дубль.
 */
export const staleReason = (
  name: string,
  expected: { variant: string; state8: string },
): "legacy" | "state" | "variant" | null => {
  const parsed = parseVoiceName(name);
  if (!parsed) return "legacy";
  if (parsed.variant !== sanitizeVariant(expected.variant)) return "variant";
  if (parsed.state8 !== expected.state8) return "state";
  return null;
};

/** Устарел ли файл по состоянию (перевод/тон). Чужой голос устаревшим не считается. */
export const isStale = (name: string, expected: { variant: string; state8: string }): boolean => {
  const reason = staleReason(name, expected);
  return reason === "legacy" || reason === "state";
};
