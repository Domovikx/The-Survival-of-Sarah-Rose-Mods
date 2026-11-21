/**
 * Пакет поставки: тег релиза и ссылки на ассеты — в ОДНОМ месте.
 *
 * Раньше тег был продублирован в `Downloads` и `VoiceDemand`: при выпуске
 * релиза один из блоков забывался и качал прошлую версию (2026-11-20).
 * Теперь меняем только `TAG` — оба блока и любые будущие берут ссылки отсюда.
 */
export const PACK = {
  /** Тег GitHub-релиза (= версия пакета из build_pack: YYYY.MM.DD-HHMM). */
  tag: "v2026.11.19-2237",
  repo: "Domovikx/The-Survival-of-Sarah-Rose-Mods",
} as const;

const BASE = `https://github.com/${PACK.repo}/releases/download/${PACK.tag}`;

/** Прямая ссылка на ассет релиза: `main` или `voice-<lang>`. */
export const packAsset = (name: string): string => `${BASE}/TSSR-AI-Voice-Pack-${name}.7z`;

/**
 * Имя ассета инсталлятора — СЕМАНТИЧНОЕ и УНИКАЛЬНОЕ по версии.
 *
 * Зачем версия в имени: exe скачивается в «Загрузки», где обычно уже лежат
 * прошлые версии с тем же именем — браузер дописывает «(1)», и невозможно
 * понять, какой файл свежий (замечание владельца 2026-11-21). Пакеты .7z
 * версию не несут, но их и качает инсталлятор, а не человек руками.
 */
export const installerAsset = (tag: string): string => `Sarah-Rose-AI-Voice-Installer-${tag}.exe`;

export const INSTALLER_ASSET = installerAsset(PACK.tag);

/** Прямая ссылка на файл релиза с любым расширением (инсталлятор, README…). */
export const packFile = (fileName: string): string => `${BASE}/${fileName}`;

/**
 * Две ссылки на инсталлятор — выбираем по режиму сборки:
 *   • dev (`npm run dev`)  — локальный файл `site/public/installer/*.exe`
 *     (папка в .gitignore: 5 МБ бинаря в репозитории не нужны);
 *   • prod (`npm run build`) — ассет GitHub-релиза: единственное место, где
 *     может лежать .exe (в архивы Nexus исполняемые файлы класть нельзя).
 */
const LOCAL_INSTALLER = `${import.meta.env.BASE_URL}installer/${INSTALLER_ASSET}`;
const RELEASE_INSTALLER = packFile(INSTALLER_ASSET);

export type InstallerSource = { url: string; mode: "dev" | "release" };

/** Активный источник инсталлятора + режим (режим видно в UI как dev-бейдж). */
export const installerSource = (): InstallerSource =>
  import.meta.env.DEV ? { url: LOCAL_INSTALLER, mode: "dev" } : { url: RELEASE_INSTALLER, mode: "release" };

/** Ссылка на инсталлятор для href. */
export const installerUrl = (): string => installerSource().url;

export const RELEASES_URL = `https://github.com/${PACK.repo}/releases`;
