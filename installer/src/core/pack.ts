/**
 * Данные релиза: откуда качать и как называются ассеты.
 *
 * Версия не хардкодится: `latest` спрашиваем у GitHub API и берём ассет по
 * имени — так инсталлятор всегда ставит текущий релиз и не требует правки при
 * выпуске нового пака.
 */

import { LANG_ORDER } from "./langs.generated";

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
} as const;
