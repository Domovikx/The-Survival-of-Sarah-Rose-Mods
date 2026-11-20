/**
 * Человеческий статус ошибки: «ошибка» без объяснения бесполезна — новичок не
 * понимает, что делать. Самый частый случай на практике — запущенная игра:
 * Windows не даёт удалить занятые файлы (`os error 32` / access denied).
 */
export type ErrorStatus = { key: string; params?: Record<string, string> };

/**
 * Признаки «файл занят другой программой» (Windows: sharing violation).
 * Сюда НЕ входят «access denied»/os error 5: это чаще права на папку, и
 * подсказка «закройте игру» там была бы враньём (отдельный случай).
 */
const BUSY = [
  "os error 32",
  "sharing violation",
  "process cannot access the file",
  "процесс не может получить доступ к файлу",
  "используется другим процессом",
];

export const errorStatus = (error: unknown): ErrorStatus => {
  const text = String(error).toLowerCase();
  return BUSY.some((marker) => text.includes(marker))
    ? { key: "the game is running — close it and try again" }
    : { key: "error" };
};
