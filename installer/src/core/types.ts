/** Общие типы инсталлятора (зеркало структур из Rust). */
export type GameInfo = {
  path: string;
  library: string;
  build_id: string | null;
  mod_installed: boolean;
};

/** Прогресс скачивания из события `download-progress`. */
export type DownloadProgress = {
  downloaded: number;
  total: number | null;
};

/** Один установленный язык: код + сколько файлов озвучки лежит в игре. */
export type LangState = {
  lang: string;
  files: number;
};

/** Что стоит в папке игры (`scan_install`). */
export type InstallState = {
  core: boolean;
  langs: LangState[];
  environment: boolean;
  /** Чужие моды в `mods/` — их инсталлятор не трогает. */
  other_mods: string[];
};

/** Результат uninstall (для честного лога). */
export type UninstallReport = {
  removed_mod: boolean;
  removed_environment: boolean;
  kept_environment: boolean;
  other_mods: string[];
};

/** Ассет релиза GitHub. */
export type ReleaseAsset = {
  name: string;
  size: number;
  browser_download_url: string;
};

export type Release = {
  tag_name: string;
  assets: ReleaseAsset[];
};
