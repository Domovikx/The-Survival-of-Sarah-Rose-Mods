/**
 * Размеры ассетов последнего релиза — чтобы человек видел, СКОЛЬКО качает,
 * до клика (5 МБ инсталлятор или 21 МБ голосовой пак — разница существенная).
 *
 * Источник — GitHub API (`assets[].size`), без токена: 60 запросов/час на IP,
 * а нам хватает одного на загрузку страницы. Ответ кэшируется в модуле, сеть
 * недоступна — размеры просто не показываем (страница работает как раньше).
 */
const RELEASE_API = "https://api.github.com/repos/Domovikx/The-Survival-of-Sarah-Rose-Mods/releases/latest";

export type AssetSizes = Record<string, number>;

let cache: Promise<AssetSizes> | null = null;

export const fetchAssetSizes = (): Promise<AssetSizes> => {
  cache ??= fetch(RELEASE_API, { headers: { accept: "application/vnd.github+json" } })
    .then(async (resp) => {
      if (!resp.ok) return {};
      const data = (await resp.json()) as { assets?: Array<{ name: string; size: number }> };
      return Object.fromEntries((data.assets ?? []).map((a) => [a.name, a.size]));
    })
    .catch(() => ({}));
  return cache;
};

/** Байты → «15.4 MB» (десятичная точка/запятая по языку страницы). */
export const formatSize = (bytes: number | undefined, lang: string): string | null => {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / 1_048_576;
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(mb)} MB`;
};

/**
 * Размер локального файла (dev-режим): HEAD-запрос к dev-серверу отдаёт
 * `content-length`. Нужно, чтобы кнопка инсталлятора показывала «5.2 MB» ещё
 * до публикации ассета в релизе — иначе человек не знает, что качает.
 */
export const fetchLocalSize = async (url: string): Promise<number | null> => {
  try {
    const resp = await fetch(url, { method: "HEAD" });
    const bytes = Number(resp.headers.get("content-length"));
    return Number.isFinite(bytes) && bytes > 0 ? bytes : null;
  } catch {
    return null;
  }
};
