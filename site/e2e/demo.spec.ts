import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CATALOGUE } from "../src/shared/config/i18n.locales";
import { localize } from "../src/shared/config/i18n.types";
import { LANGS } from "../src/shared/config/languages";
import { DEMO_PHRASES } from "../src/widgets/demo/ui/DemoPhrases.phrases";

/**
 * E2E связки ТЕКСТ + ОПУС (владелец 2026-11-11: «связка обязательна, по-другому
 * работать не будет»). Инвариант: uid = md5(en-текста реплики) = игровой uid;
 * каждая папка аудио-языка полна; клик play реально запрашивает {uid}.opus
 * своего языка.
 *
 * Демо-фразы — ОТДЕЛЬНЫЙ кейс переводов: не общий каталог сайта, а
 * `src/widgets/demo/ui/DemoPhrases.phrases.ts`, сгенерированный из `patches/ai-voice-pack/po/
 * <lang>.po` (из этих msgstr сделан звук). Поэтому здесь же проверяется, что
 * сгенерированное не разошлось с po — иначе на странице один текст, в наушниках
 * другой.
 */

const BASE = "/The-Survival-of-Sarah-Rose-Mods/";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** msgid -> msgstr для po-файла игры. */
const readPo = (lang: string): Map<string, string> => {
  const map = new Map<string, string>();
  const text = readFileSync(join(ROOT, "..", "patches", "ai-voice-pack", "po", `${lang}.po`), "utf8");
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.startsWith("msgid ")) continue;
    const id = JSON.parse(lines[i]!.slice(6).trim()) as string;
    const next = lines[i + 1] ?? "";
    if (next.startsWith("msgstr ")) map.set(id, JSON.parse(next.slice(7).trim()) as string);
  }
  return map;
};

/** Перевод UI-строки каталога (для aria-label плеера). */
const ui = (lang: string, key: string): string =>
  (localize(CATALOGUE, lang as "en") as unknown as Record<string, string>)[key]!;

test.describe("демо: связка текст + опус", () => {
  test("инвариант: uid = md5(английского текста реплики)", () => {
    for (const [i, phrase] of DEMO_PHRASES.entries()) {
      const md5 = createHash("md5").update(phrase.text.en, "utf8").digest("hex");
      expect(phrase.uid, `фраза #${i + 1}: uid != md5(en-текста)`).toBe(md5);
    }
  });

  test("тексты и имена спикеров — строго из po (иначе сайт врёт против аудио)", () => {
    for (const lang of LANGS) {
      if (lang === "en") continue;
      const po = readPo(lang);
      for (const [i, phrase] of DEMO_PHRASES.entries()) {
        expect(phrase.text[lang], `${lang}: фраза #${i + 1} разошлась с po`).toBe(po.get(phrase.text.en));
        expect(phrase.speaker[lang], `${lang}: спикер #${i + 1} разошёлся с po`).toBe(po.get(phrase.speaker.en));
        expect(phrase.text[lang]?.trim(), `${lang}: фраза #${i + 1} пустая`).not.toBe("");
      }
    }
  });

  test("каждая папка аудио-языка полна: все uid есть, опусы непустые", () => {
    const demoDir = join(ROOT, "public", "demo");
    const langs = readdirSync(demoDir).filter((dir) => statSync(join(demoDir, dir)).isDirectory());
    expect(langs.length, "нет ни одной папки аудио-языка").toBeGreaterThan(0);
    for (const lang of langs) {
      for (const phrase of DEMO_PHRASES) {
        const file = join(demoDir, lang, `${phrase.uid}.opus`);
        expect(existsSync(file), `${lang}: нет опуса ${phrase.uid} (${phrase.speaker.en})`).toBe(true);
        expect(statSync(file).size, `${lang}: опус ${phrase.uid} пустой`).toBeGreaterThan(1000);
      }
    }
  });
});

const row = (page: Page, i: number) => page.getByTestId(`demo-row-${i}`);

/** Переключить язык интерфейса через дропдаун шапки. */
const openLang = async (page: Page, lang: string): Promise<void> => {
  await page.getByTestId("lang-switcher").click();
  await page.getByTestId(`lang-${lang}`).click();
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
};

test.describe("демо: плеер на странице", () => {
  test("все фразы отрисованы с текстами текущей локали (EN)", async ({ page }) => {
    await page.goto(BASE);
    expect(DEMO_PHRASES.length).toBeGreaterThan(0);
    for (const [i, phrase] of DEMO_PHRASES.entries()) {
      await expect(page.getByTestId(`demo-text-${i}`)).toHaveText(phrase.text.en);
    }
  });

  test("подписи плеера — из локали с подстановкой имени (ключ с двоеточием)", async ({ page }) => {
    // Страховка на keySeparator/nsSeparator: ключ «Play: {{name}}» содержит
    // двоеточие, и при дефолтных настройках i18next резал бы его как namespace.
    await page.goto(BASE);
    await openLang(page, "ru");
    const phrase = DEMO_PHRASES[0]!;
    await expect(page.getByTestId("demo-play-0")).toHaveAttribute(
      "aria-label",
      ui("ru", "Play: {{name}}").replace("{{name}}", phrase.speaker.ru),
    );
  });

  test("у каждой фразы чипы всех 11 языков озвучки", async ({ page }) => {
    await page.goto(BASE);
    const langs = JSON.parse(readFileSync(join(ROOT, "..", "config", "language-priority.json"), "utf8")).languages.map(
      (l: { code: string }) => l.code,
    ) as string[];
    for (let i = 0; i < DEMO_PHRASES.length; i++) {
      for (const lang of langs) {
        await expect(page.getByTestId(`demo-chip-${i}-${lang}`)).toBeVisible();
      }
    }
  });

  test("клик play запрашивает опус СВОЕГО языка и uid — и получает 200", async ({ page }) => {
    await page.goto(BASE);
    const uid = DEMO_PHRASES[0]!.uid;
    const req = page.waitForRequest(new RegExp(`demo/en/${uid}\\.opus`));
    await page.getByTestId("demo-play-0").click();
    const audioReq = await req;
    const resp = await audioReq.response();
    // аудио-элемент запрашивает с Range -> штатно 206 Partial Content
    expect([200, 206], `аудио не отдалось: ${audioReq.url()}`).toContain(resp?.status());
    await expect(page.getByTestId("demo-play-0")).toHaveAttribute("data-playing", "true");
  });

  test("чип языка проигрывает ту же фразу на выбранном языке", async ({ page }) => {
    await page.goto(BASE);
    const uid = DEMO_PHRASES[0]!.uid;
    const req = page.waitForRequest(new RegExp(`demo/ru/${uid}\\.opus`));
    await page.getByTestId("demo-chip-0-ru").click();
    const audioReq = await req;
    const resp = await audioReq.response();
    expect([200, 206], `аудио не отдалось: ${audioReq.url()}`).toContain(resp?.status());
    await expect(page.getByTestId("demo-chip-0-ru")).toHaveAttribute("aria-pressed", "true");
    await expect(row(page, 0)).toBeVisible();
  });

  test("переключение чипа меняет язык той же фразы", async ({ page }) => {
    await page.goto(BASE);
    const uid = DEMO_PHRASES[1]!.uid;
    const enReq = page.waitForRequest(new RegExp(`demo/en/${uid}\\.opus`));
    await page.getByTestId("demo-chip-1-en").click();
    await enReq;
    const deReq = page.waitForRequest(new RegExp(`demo/de/${uid}\\.opus`));
    await page.getByTestId("demo-chip-1-de").click();
    await deReq;
    // В headless-браузере без аудиоустройства play() может отклониться и сбросить
    // подсветку — проверяем сам факт запроса нужного языка (это и есть контракт чипа).
    await expect(row(page, 1)).toBeVisible();
  });
});
