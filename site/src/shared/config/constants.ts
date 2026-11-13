/** Ключи localStorage (паттерн из CV-for-alpha). */
export const STORAGE_KEYS = {
  lang: 'tssr-lang',
  theme: 'tssr-theme',
} as const

export const LINKS = {
  /** Витрина и все скачивания — Nexus Mods (решение владельца 2026-11-13:
   *  статистика и рейтинг в одном месте, GitHub остаётся портфолио/исходниками). */
  nexus: 'https://www.nexusmods.com/mods/1?game_id=11043',
  /** Страница расширения Vortex (Modding Tools → Vortex Extensions). */
  vortexExtension: 'https://www.nexusmods.com/games/site/mods/2600',
  github: 'https://github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods',
  issues: 'https://github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods/issues',
  steam: 'https://store.steampowered.com/app/2166470/The_Survival_of_Sarah_Rose/',
  license: 'https://creativecommons.org/licenses/by-nc/4.0/',
} as const
