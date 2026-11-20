import { describe, expect, test } from "vitest";

import { CORE_ASSET, fallbackRelease, REPO, VOICE_LANGS, voiceAsset } from "./pack";

/**
 * Запасной релиз: когда GitHub API отдаёт 403 (лимит без токена), установка не
 * должна падать — качаем по прямой ссылке `releases/latest/download/<имя>`.
 */
describe("fallbackRelease", () => {
  test("все ассеты на месте, ссылки ведут на latest/download", () => {
    const rel = fallbackRelease();
    const names = rel.assets.map((a) => a.name);
    expect(names).toContain(CORE_ASSET);
    for (const lang of VOICE_LANGS) expect(names).toContain(voiceAsset(lang));
    expect(rel.assets).toHaveLength(VOICE_LANGS.length + 1);
    for (const a of rel.assets) {
      expect(a.browser_download_url).toBe(`https://github.com/${REPO}/releases/latest/download/${a.name}`);
      // Размер неизвестен без API — интерфейс покажет «—», а не врёт числом.
      expect(a.size).toBe(0);
    }
  });
});
