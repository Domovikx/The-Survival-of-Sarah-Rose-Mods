import { describe, expect, test } from "vitest";

import { formatBytes, formatDuration, percent } from "./format";

describe("formatBytes", () => {
  test("байты и мегабайты читаются по-человечески", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(18_853_036)).toBe("18.0 MB");
  });

  test("мусор на входе не ломает строку", () => {
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(-5)).toBe("0 B");
  });
});

describe("percent", () => {
  test("без общего размера прогресс = 0 (не делим на ноль)", () => {
    expect(percent(100, null)).toBe(0);
    expect(percent(100, 0)).toBe(0);
  });

  test("обычный и крайние случаи", () => {
    expect(percent(50, 200)).toBe(25);
    expect(percent(200, 200)).toBe(100);
    expect(percent(500, 200)).toBe(100);
  });
});

describe("formatDuration", () => {
  test("секунды и минуты", () => {
    expect(formatDuration(12)).toBe("12 с");
    expect(formatDuration(60)).toBe("1 мин");
    expect(formatDuration(80)).toBe("1 мин 20 с");
  });
});
