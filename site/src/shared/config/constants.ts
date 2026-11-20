/** Ключи localStorage (паттерн из CV-for-alpha). */
export const STORAGE_KEYS = {
  lang: "tssr-lang",
  theme: "tssr-theme",
} as const;

export const LINKS = {
  // Nexus-ссылки убраны из бандла до публикации страницы мода (2026-11-20):
  // на лендинге не должно быть ни текста, ни URL. Вернуть вместе с блоками:
  //   nexus: "https://www.nexusmods.com/mods/1?game_id=11043",
  //   vortexExtension: "https://www.nexusmods.com/games/site/mods/2600",
  github: "https://github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods",
  issues: "https://github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods/issues",
  steam: "https://store.steampowered.com/app/2166470/The_Survival_of_Sarah_Rose/",
  /** Гайд в Steam: лайки и комментарии — основной канал спроса на озвучку. */
  steamGuide: "https://steamcommunity.com/sharedfiles/filedetails/?id=3733106761",
  license: "https://creativecommons.org/licenses/by-nc/4.0/",
} as const;
