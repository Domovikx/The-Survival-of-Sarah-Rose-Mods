import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

/**
 * ПАТТЕРН (2026-11-20): `data-testid` ставим ПО УМОЛЧАНИЮ — на корень
 * компонента и на каждый интерактивный элемент. Правило самопроверки:
 *
 *   «Можно ли здесь НЕ ставить data-testid?» — если «да», то ПОЧЕМУ.
 *   Причина записывается рядом: `// testid-exempt: <причина>` (≥ 4 символов).
 *
 * Нет причины — id нужен: тест ловит это механически. Обоснованные исключения:
 *   • декоративные иконки/флаги (`aria-hidden`) — их не ищут, смысл в тексте;
 *   • невидимый `<input>` внутри `<label>` — тест жмёт по плашке, id у плашки;
 *   • служебные обёртки без поведения (inner/row) — id у смысловых узлов.
 */

const ROOT_DIR = process.cwd();
const SRC = join(ROOT_DIR, "src");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
  });

const FILES = walk(SRC);

/** Конец JSX-тега от `<` с учётом `{}` и кавычек (стрелки `=>` не мешают). */
const tagEnd = (text: string, start: number): number => {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return i;
  }
  return text.length;
};

export type Violation = { file: string; tag: string; line: number };

/** Скан текста файла: интерактивные теги без `data-testid` (кроме исключений). */
export const scanText = (file: string, text: string): Violation[] => {
  const out: Violation[] = [];
  for (const m of text.matchAll(/<(button|a|input|select|textarea)\b/g)) {
    const start = m.index!;
    const end = tagEnd(text, start);
    const tag = text.slice(start, end + 1);
    if (tag.includes("data-testid")) continue;
    const before = text.slice(Math.max(0, start - 220), start);
    const exempt = /\/\/\s*testid-exempt:\s*(\S[^\n]*)/.exec(before);
    if (exempt && exempt[1]!.trim().length >= 4) continue;
    out.push({ file, tag: tag.slice(0, 60), line: text.slice(0, start).split("\n").length });
  }
  return out;
};

/** Интерактивные элементы без id по всем компонентам. */
const missingIds = (): Violation[] =>
  FILES.flatMap((file) => scanText(file.replace(ROOT_DIR, ""), readFileSync(file, "utf-8")));

/** Корень компонента обязан быть помечен `data-testid` (обычно `={ROOT}`). */
const rootsOk = (): string[] =>
  FILES.filter((file) => {
    const text = readFileSync(file, "utf-8");
    const isComponent = text.includes("export const ROOT") || file.endsWith("App.tsx");
    return isComponent && !text.includes("data-testid");
  }).map((f) => f.replace(ROOT_DIR, ""));

describe("data-testid: паттерн «по умолчанию, без причины не убираем»", () => {
  test("у каждого интерактивного элемента есть id или веская причина", () => {
    expect(missingIds()).toEqual([]);
  });

  test("корень каждого компонента помечен data-testid", () => {
    expect(rootsOk()).toEqual([]);
  });
});

describe("страж data-testid: самопроверка сканера", () => {
  test("находит кнопку без id, уважает исключение с причиной", () => {
    expect(scanText("x.tsx", `<button onClick={() => run()}>ok</button>`)).toHaveLength(1);
    expect(scanText("x.tsx", `<button data-testid="X--ok" onClick={() => run()}>ok</button>`)).toHaveLength(0);
    expect(scanText("x.tsx", `// testid-exempt: декоративная обёртка без поведения\n<button>ok</button>`)).toHaveLength(
      0,
    );
    // «причина» из одного слова — не причина
    expect(scanText("x.tsx", `// testid-exempt: да\n<button>ok</button>`)).toHaveLength(1);
  });
});
