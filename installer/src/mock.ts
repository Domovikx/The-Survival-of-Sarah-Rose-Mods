/**
 * Мок-бэкенд для просмотра интерфейса в браузере (`npm run dev`).
 *
 * В окне Tauri вызовы идут в Rust; в обычном браузере их нет — и экран
 * показывал бы «игра не найдена». Здесь подменяем ровно транспорт Tauri
 * (`window.__TAURI_INTERNALS__`), а весь UI и его логика остаются настоящими.
 *
 * Включается сам, если приложение открыто НЕ в Tauri; отключается `?mock=0`.
 */
import type { InstallState } from "@/core/types";

const DEMO_GAME = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\The Survival of Sarah Rose";
const LANGS: Record<string, number> = {
  en: 1195,
  zh: 1284,
  ru: 1397,
  es: 1284,
  pt: 1284,
  de: 1284,
  ja: 1173,
  fr: 1171,
  pl: 1171,
  ko: 1171,
  it: 1171,
};

/** Слушатели событий Tauri: id → функция (нужно для `listen`). */
type Handler = (event: { event: string; id: number; payload: unknown }) => void;

export const installMockBackend = (): void => {
  const listeners = new Map<number, { event: string; handler: (e: unknown) => void }>();
  let nextId = 1;
  let installed: InstallState = {
    core: true,
    langs: Object.entries(LANGS).map(([lang, files]) => ({ lang, files })),
    environment: true,
    other_mods: [],
  };

  const emit = (event: string, payload: unknown): void => {
    for (const [, l] of listeners) if (l.event === event) l.handler({ event, id: 0, payload });
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const invoke = async (cmd: string, args?: Record<string, unknown>): Promise<unknown> => {
    // Подписка/отписка событий: Tauri присылает id колбэка и имя события.
    if (cmd === "plugin:event|listen") {
      const id = Number(args?.handler);
      const entry = listeners.get(id);
      if (entry) entry.event = String(args?.event ?? "");
      return id;
    }
    if (cmd === "plugin:event|unlisten") return null;

    // Внешние ссылки: в браузере открываем вкладку (в exe это делает плагин,
    // иначе клик по ссылке в шапке/футере молча ничего не делал).
    if (cmd === "plugin:opener|open_url") {
      window.open(String(args?.url ?? ""), "_blank", "noopener");
      return null;
    }

    switch (cmd) {
      case "system_locale":
        return navigator.language || "ru-RU";
      case "app_dir":
        return "C:\\TSSR-Voice-Pack";
      case "find_game":
        // `?nogame` — посмотреть состояние «игра не найдена» (только мок).
        if (new URLSearchParams(window.location.search).has("nogame")) return null;
        return {
          path: DEMO_GAME,
          library: DEMO_GAME.replace(/\\steamapps.*/, ""),
          build_id: "25854678",
          mod_installed: true,
        };
      case "sha256_file":
        return "mock-sha256-" + String(args?.path ?? "").slice(-24);
      case "scan_install":
        return installed;
      case "download": {
        // Показываем прогресс как в жизни: 12 шагов по 2 МБ.
        const total = 18_853_036;
        for (let i = 1; i <= 12; i++) {
          await sleep(180);
          emit("download-progress", { downloaded: Math.round((total * i) / 12), total });
        }
        return total;
      }
      case "extract": {
        // Как Rust: распаковка МЕНЯЕТ установку, иначе после «Применить»
        // повторный scan_install не увидит новый язык (E2E ловил это).
        const archive = String(args?.archive ?? "");
        const voice = /-voice-([a-z]{2})\.7z$/.exec(archive);
        if (voice) {
          const lang = voice[1] ?? "";
          const files = LANGS[lang] ?? 0;
          installed = {
            ...installed,
            langs: [...installed.langs.filter((l) => l.lang !== lang), { lang, files }].sort((a, b) =>
              a.lang.localeCompare(b.lang),
            ),
          };
        } else if (archive.endsWith("main.7z")) {
          installed = { ...installed, core: true, environment: true };
        }
        return 2452;
      }
      case "remove_lang": {
        // Настоящее удаление языка — тысячи файлов, это заметное время.
        await sleep(500);
        const lang = String(args?.lang);
        const files = installed.langs.find((l) => l.lang === lang)?.files ?? 0;
        installed = { ...installed, langs: installed.langs.filter((l) => l.lang !== lang) };
        return files;
      }
      case "uninstall":
        await sleep(900);
        installed = { core: false, langs: [], environment: false, other_mods: [] };
        return { removed_mod: true, removed_environment: true, kept_environment: false, other_mods: [] };
      default:
        // Служебные вызовы Tauri (event listen и пр.) — тихо ок.
        return null;
    }
  };

  const w = window as unknown as Record<string, unknown>;
  w.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback: (cb: Handler) => {
      const id = nextId++;
      listeners.set(id, { event: "", handler: cb as (e: unknown) => void });
      return id;
    },
    unregisterCallback: (id: number) => {
      listeners.delete(id);
    },
    convertFileSrc: (p: string) => p,
  };
};
