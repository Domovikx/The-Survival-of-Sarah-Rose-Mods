/**
 * backend_wait.mts — «бэкенд ушёл, ждём» — чистое решение, без сети.
 *
 * Зачем отдельный модуль: 2026-11-14 рестарт Strata (смена профиля turbo)
 * уронил порт на ~2 минуты, и `translate_run.mts` за 122 с «обработал» всю
 * оставшуюся очередь как сбои (`TypeError: fetch failed` — не ошибка строки,
 * а отсутствие сервера). Прогресс не потерялся (сбойные строки не пишутся в
 * done), но 12 тыс. секунд CPU ушли в мусор, а прогон завершился «ГОТОВО» без
 * перевода. Теперь такие ошибки ЖДУТ бэкенд и повторяют ТУ ЖЕ строку.
 */
const BACKEND_DOWN =
  /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|socket hang up|other side closed|UND_ERR/i;

export interface Retry {
  /** Ждать и повторить (а не считать строку сбойной). */
  wait: boolean;
  reason: string;
}

/**
 * Решение по ошибке вызова бэкенда.
 * @param err ошибка fetch/ответа
 * @param waitedMs сколько уже ждём
 * @param maxMs предел ожидания (после него — обычный сбой строки)
 */
export function retryDecision(err: unknown, waitedMs: number, maxMs: number): Retry {
  const msg = String(err);
  if (!BACKEND_DOWN.test(msg)) return { wait: false, reason: "не сетевая ошибка — лечим повтором строки" };
  if (waitedMs >= maxMs) return { wait: false, reason: `бэкенд не вернулся за ${Math.round(maxMs / 60_000)} мин` };
  return { wait: true, reason: "бэкенд недоступен — ждём" };
}
