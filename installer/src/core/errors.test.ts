import { describe, expect, test } from "vitest";

import { errorStatus } from "./errors";

describe("errorStatus", () => {
  test("занятый файл (игра запущена) → подсказка закрыть игру", () => {
    for (const text of [
      "uninstall: os error 32: The process cannot access the file",
      "sharing violation",
      "Процесс не может получить доступ к файлу",
    ]) {
      expect(errorStatus(new Error(text)).key).toBe("the game is running — close it and try again");
    }
  });

  test("прочие ошибки → общий статус (в т.ч. «нет прав на папку»)", () => {
    expect(errorStatus(new Error("HTTP 403 для https://…")).key).toBe("error");
    expect(errorStatus("GitHub API 500").key).toBe("error");
    // Права на запись — не про запущенную игру: подсказка была бы неверной.
    expect(errorStatus(new Error("Access is denied. (os error 5)")).key).toBe("error");
  });
});
