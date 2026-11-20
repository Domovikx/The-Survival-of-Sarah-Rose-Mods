/**
 * Человеческий статус ошибки: «ошибка» без объяснения бесполезна — новичок не
 * понимает, что делать. Самый частый случай на практике — запущенная игра:
 * Windows не даёт удалить занятые файлы (`os error 32` / access denied).
 */
export type ErrorStatus = { key: string; params?: Record<string, string> };

/** Признаки «файл занят другой программой» в тексте ошибки Windows. */
const BUSY = [
  "os error 32",
  "os error 5",
  "access is denied",
  "sharing violation",
  "process cannot access",
  "отказано в доступе",
  "процесс не может получить доступ",
  "используется другим процессом",
];

export const errorStatus = (error: unknown): ErrorStatus => {
  const text = String(error).toLowerCase();
  return BUSY.some((marker) => text.includes(marker))
    ? { key: "the game is running — close it and try again" }
    : { key: "error" };
};
