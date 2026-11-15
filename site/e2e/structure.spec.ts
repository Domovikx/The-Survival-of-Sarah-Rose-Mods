import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Структурные правила сайта (решения владельца 2026-11-15), которые типом не
 * проверить:
 *   • стили живут в `<Компонент>.styles.ts`, а не в разметке;
 *   • иконки — в одном файле `shared/ui/icons.tsx`;
 *   • ни стилевых, ни иконочных «сирот».
 *
 * Тест статический (читает исходники), запускается вместе с остальными e2e.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const ICONS = join(SRC, "shared", "ui", "icons.tsx");
const LOCALES = join(SRC, "shared", "config", "i18n.locales.ts");
const DEMO_PHRASES_FILE = join(SRC, "widgets", "demo", "ui", "DemoPhrases.phrases.ts");

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });

const FILES = walk(SRC);
const COMPONENTS = FILES.filter((file) => file.endsWith(".tsx"));
const STYLES = FILES.filter((file) => file.endsWith(".styles.ts"));
const read = (file: string): string => readFileSync(file, "utf-8");

test.describe("структура сайта: стили и иконки", () => {
  test("stylex.create только в *.styles.ts (в компонентах — только стили через импорт)", () => {
    const offenders = COMPONENTS.filter((file) => read(file).includes("stylex.create"));
    expect(offenders, "вынеси стили в соседний <Компонент>.styles.ts").toEqual([]);
  });

  test("каждый *.styles.ts экспортирует styles и импортируется своим компонентом", () => {
    for (const stylesFile of STYLES) {
      const text = read(stylesFile);
      expect(text, `${basename(stylesFile)}: нет export const styles`).toContain("export const styles");
      const component = stylesFile.replace(/\.styles\.ts$/, ".tsx");
      expect(existsSync(component), `${basename(stylesFile)}: нет компонента ${basename(component)}`).toBe(true);
      const importLine = `from "./${basename(stylesFile, ".styles.ts")}.styles"`;
      expect(read(component), `${basename(component)}: не импортирует ${basename(stylesFile)}`).toContain(importLine);
    }
  });

  test("компонент, использующий styles, берёт их из *.styles.ts, а не держит своё", () => {
    for (const file of COMPONENTS) {
      if (!read(file).includes("styles.")) continue;
      const sibling = file.replace(/\.tsx$/, ".styles.ts");
      if (!existsSync(sibling)) continue; // стили приходят из общих (Section и т.п.)
      expect(read(file), `${basename(file)}: styles без импорта своего файла`).toContain(
        `from "./${basename(sibling, ".styles.ts")}.styles"`,
      );
    }
  });

  test("className собирается через cx: stylex.props в компонентах не пишем", () => {
    // `stylex.props(x).className` — 40 символов шума на каждую строку разметки.
    // Единственный дом этого вызова — shared/ui/cx.ts.
    const offenders = COMPONENTS.filter((file) => basename(file) !== "cx.ts" && read(file).includes("stylex.props("));
    expect(offenders, "используй className={cx(styles.x)} из @/shared/ui").toEqual([]);
  });

  test("i18n.locales.ts — только тексты: один import и один export", () => {
    // Вычитка и перевод идут по чистому списку пар «английский → 10 языков».
    // Появился тип/функция в этом файле — значит их место в i18n.types.ts.
    const text = read(LOCALES);
    expect(text, "в локалях появилась логика").not.toContain("=>");
    expect(text.match(/^export /gm) ?? [], "в локалях больше одного export").toHaveLength(1);
    expect(text, "export должен быть CATALOGUE").toContain("export const CATALOGUE = dict({");
    const imports = text.match(/^import .*$/gm) ?? [];
    expect(imports, "импорт должен быть только для dict").toEqual(['import { dict } from "./i18n.types";']);
  });

  test("демо-фразы — отдельный кейс: не в каталоге, а в widgets/demo/ui/DemoPhrases.phrases.ts (из po)", () => {
    // Реплики озвучки — не «тексты интерфейса»: их источник po игры, поэтому в
    // общем каталоге их быть не должно (иначе на вычитке путаются с t()).
    const phrases = read(DEMO_PHRASES_FILE);
    expect(phrases, "phrases.ts должен быть помечен как сгенерированный").toContain("СГЕНЕРИРОВАНО");
    expect(read(join(SRC, "widgets", "demo", "ui", "DemoPhrases.tsx"))).toContain('from "./DemoPhrases.phrases"');

    const locales = read(LOCALES);
    for (const line of phrases.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("en: ")) continue;
      const key = JSON.parse(trimmed.slice(4).replace(/,$/, "")) as string;
      expect(
        locales.includes(`${JSON.stringify(key)}:`),
        `демо-реплика попала в общий каталог: ${key.slice(0, 40)}`,
      ).toBe(false);
    }
  });

  test("все SVG-иконки — в shared/ui/icons.tsx", () => {
    const offenders = COMPONENTS.filter((file) => file !== ICONS && read(file).includes("<svg"));
    expect(offenders, "иконки собираем в shared/ui/icons.tsx (размер — проп size)").toEqual([]);
    const icons = read(ICONS);
    for (const name of ["SteamIcon", "SunIcon", "MoonIcon", "PlayIcon", "PauseIcon"]) {
      expect(icons, `icons.tsx: нет ${name}`).toContain(`export const ${name}`);
    }
  });
});
