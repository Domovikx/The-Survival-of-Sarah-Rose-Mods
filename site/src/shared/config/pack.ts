/**
 * Пакет поставки: тег релиза и ссылки на ассеты — в ОДНОМ месте.
 *
 * Раньше тег был продублирован в `Downloads` и `VoiceDemand`: при выпуске
 * релиза один из блоков забывался и качал прошлую версию (2026-11-20).
 * Теперь меняем только `TAG` — оба блока и любые будущие берут ссылки отсюда.
 */
export const PACK = {
  /** Тег GitHub-релиза (= версия пакета из build_pack: YYYY.MM.DD-HHMM). */
  tag: "v2026.11.19-2237",
  repo: "Domovikx/The-Survival-of-Sarah-Rose-Mods",
} as const;

const BASE = `https://github.com/${PACK.repo}/releases/download/${PACK.tag}`;

/** Прямая ссылка на ассет релиза: `main` или `voice-<lang>`. */
export const packAsset = (name: string): string => `${BASE}/TSSR-AI-Voice-Pack-${name}.7z`;

/** Страница всех релизов (когда нужен не конкретный файл, а список). */
export const RELEASES_URL = `https://github.com/${PACK.repo}/releases`;
