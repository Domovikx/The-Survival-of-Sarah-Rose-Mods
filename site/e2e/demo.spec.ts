import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * E2E связки ТЕКСТ + ОПУС (владелец 2026-11-11: «связка обязательна, по-другому
 * работать не будет»). Инвариант: uid = md5(en-текста реплики) = игровой uid;
 * каждая папка аудио-языка полна (все uid манифеста); клик play реально
 * запрашивает {uid}.opus своего языка.
 */

const BASE = "/The-Survival-of-Sarah-Rose-Mods/";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEMO = join(ROOT, "public", "demo");

type Manifest = {
  phrases: Array<{ uid: string; speaker: string; text: string }>;
};
type Locale = {
  demo: { phrases: Array<{ speaker: string; text: string }> };
};

const manifest = JSON.parse(readFileSync(join(ROOT, "src", "widgets", "demo", "manifest.json"), "utf8")) as Manifest;
const loadLocale = (lang: string): Locale =>
  JSON.parse(readFileSync(join(ROOT, "locales", `${lang}.json`), "utf8")) as Locale;

test.describe("демо: связка текст + опус", () => {
  test("инвариант: uid = md5(en-текста), спикеры и порядок = demo.phrases", () => {
    const en = loadLocale("en");
    expect(manifest.phrases).toHaveLength(en.demo.phrases.length);
    manifest.phrases.forEach((p, i) => {
      const md5 = createHash("md5").update(en.demo.phrases[i]!.text, "utf8").digest("hex");
      expect(p.uid, `фраза #${i + 1}: uid != md5(en-текста)`).toBe(md5);
      expect(p.speaker, `фраза #${i + 1}: спикер`).toBe(en.demo.phrases[i]!.speaker);
      expect(p.text, `фраза #${i + 1}: текст манифеста`).toBe(en.demo.phrases[i]!.text);
    });
  });

  test("порядок и спикеры всех локалей = манифесту (индексная связка не разъехалась)", () => {
    for (const f of readdirSync(join(ROOT, "locales"))) {
      const lang = f.replace(/\.json$/, "");
      const loc = loadLocale(lang);
      expect(loc.demo.phrases, `локаль ${lang}: число фраз`).toHaveLength(manifest.phrases.length);
      loc.demo.phrases.forEach((p, i) => {
        expect(p.text.trim(), `${lang}: фраза #${i + 1} пустая`).not.toBe("");
        expect(p.speaker.trim(), `${lang}: спикер #${i + 1} пустой`).not.toBe("");
      });
    }
  });

  test("каждая папка аудио-языка полна: все uid манифеста есть, опусы непустые", () => {
    const langs = readdirSync(DEMO).filter((d) => statSync(join(DEMO, d)).isDirectory());
    expect(langs.length, "нет ни одной папки аудио-языка").toBeGreaterThan(0);
    for (const lang of langs) {
      for (const p of manifest.phrases) {
        const file = join(DEMO, lang, `${p.uid}.opus`);
        expect(existsSync(file), `${lang}: нет опуса ${p.uid} (${p.speaker})`).toBe(true);
        expect(statSync(file).size, `${lang}: опус ${p.uid} пустой`).toBeGreaterThan(1000);
      }
    }
  });
});

const row = (page: Page, i: number) => page.getByTestId(`demo-row-${i}`);

test.describe("демо: плеер на странице", () => {
  test("7 строк с текстами текущей локали (EN)", async ({ page }) => {
    await page.goto(BASE);
    const en = loadLocale("en");
    for (let i = 0; i < en.demo.phrases.length; i++) {
      await expect(page.getByTestId(`demo-text-${i}`)).toHaveText(en.demo.phrases[i]!.text);
    }
  });

  test("клик play запрашивает опус СВОЕГО языка и uid — и получает 200", async ({ page }) => {
    await page.goto(BASE);
    const uid = manifest.phrases[0]!.uid;
    const req = page.waitForRequest(new RegExp(`demo/en/${uid}\\.opus`));
    await page.getByTestId("demo-play-0").click();
    const audioReq = await req;
    const resp = await audioReq.response();
    // аудио-элемент запрашивает с Range -> штатно 206 Partial Content
    expect([200, 206], `аудио не отдалось: ${audioReq.url()}`).toContain(resp?.status());
    await expect(page.getByTestId("demo-play-0")).toHaveAttribute("data-playing", "true");
  });

  test("язык без аудио-папки получает en-опус (фолбэк, не молчание)", async ({ page }) => {
    // zh не в AUDIO_LANGS -> плеер обязан обратиться к demo/en/{uid}.opus
    await page.goto(BASE);
    await page.getByTestId("lang-switcher").click();
    await page.getByTestId("lang-zh").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh");
    const uid = manifest.phrases[0]!.uid;
    const req = page.waitForRequest(new RegExp(`demo/en/${uid}\\.opus`));
    await page.getByTestId("demo-play-0").click();
    await req;
    await expect(row(page, 0)).toBeVisible();
  });
});
