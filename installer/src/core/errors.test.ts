import { describe, expect, test } from "vitest";

import { errorStatus } from "./errors";

describe("errorStatus", () => {
  test("занятый файл (игра запущена) → подсказка закрыть игру", () => {
    for (const text of [
      "uninstall: os error 32: The process cannot access the file",
      "Access is denied. (os error 5)",
      "Процесс не может получить доступ к файлу",
    ]) {
      expect(errorStatus(new Error(text)).key).toBe("the game is running — close it and try again");
    }
  });

  test("прочие ошибки → общий статус", () => {
    expect(errorStatus(new Error("HTTP 403 для https://…")).key).toBe("error");
    expect(errorStatus("GitHub API 500").key).toBe("error");
  });
});
