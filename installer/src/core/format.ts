/** Человеческие размеры и проценты — без зависимостей, чисто для тестов. */

/** 1536 -> «1.5 KB» (1024-базный, как в проводнике Windows). */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
};

/** Доля готовности 0..100; без total — 0 (неизвестный размер ещё не прогресс). */
export const percent = (done: number, total: number | null): number => {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, (done / total) * 100));
};

/** Секунды -> «1 мин 20 с» / «12 с». */
export const formatDuration = (sec: number): string => {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} с`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m} мин ${rest} с` : `${m} мин`;
};
