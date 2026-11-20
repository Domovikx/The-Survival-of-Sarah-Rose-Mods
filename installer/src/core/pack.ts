/**
 * Данные релиза: откуда качать и как называются ассеты.
 *
 * Версия не хардкодится: `latest` спрашиваем у GitHub API и берём ассет по
 * имени — так инсталлятор всегда ставит текущий релиз и не требует правки при
 * выпуске нового пака.
 */

import { LANG_ORDER } from "./langs.generated";
import type { Release } from "./types";

export const REPO = "Domovikx/The-Survival-of-Sarah-Rose-Mods";
export const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Имя ассета ядра (main: тексты, шрифты, меню мода). */
export const CORE_ASSET = "TSSR-AI-Voice-Pack-main.7z";

/**
 * Озвучка — отдельными паками. ПОРЯДОК языков — из `config/language-priority.json`
 * (единый источник, генерится в `langs.generated.ts`): Steam-статистика,
 * решение владельца 2026-11-13. Руками список не правим.
 */
export const VOICE_LANGS = LANG_ORDER;

export type Lang = (typeof VOICE_LANGS)[number];

export const voiceAsset = (lang: string): string => `TSSR-AI-Voice-Pack-voice-${lang}.7z`;

/** Куда ведут «спасибо»-ссылки инсталлятора (внешний браузер через opener). */
export const LINKS = {
  github: `https://github.com/${REPO}`,
  issues: `https://github.com/${REPO}/issues`,
  /** Steam-гайд: лайки/комментарии — основной канал спроса на озвучку. */
  steamGuide: "https://steamcommunity.com/sharedfiles/filedetails/?id=3733106761",
  /** Страница игры в Steam (App ID 2166470) — «официальная версия» в шапке. */
  steamStore: "https://store.steampowered.com/app/2166470/",
} as const;

/**
 * Запасной адрес релиза без GitHub API: GitHub отдаёт АКТУАЛЬНЫЙ ассет по
 * `releases/latest/download/<имя>`, размеры при этом неизвестны (0 → «—»).
 *
 * Зачем: API без токена — 60 запросов в час на IP, и при исчерпании лимита
 * (проверено 2026-11-20: ответ 403) установка падала целиком. Скачивание
 * по этой ссылке работает всегда, потому что не ходит через API.
 */
export const fallbackRelease = (): Release => ({
  tag_name: "latest",
  assets: [CORE_ASSET, ...VOICE_LANGS.map(voiceAsset)].map((name) => ({
    name,
    size: 0,
    browser_download_url: `https://github.com/${REPO}/releases/latest/download/${name}`,
  })),
});
