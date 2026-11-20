import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

import { formatBytes, percent } from "./core/format";
import { LINKS, RELEASE_API, VOICE_LANGS, voiceAsset } from "./core/pack";
import { diffLangs } from "./core/plan";
import type { DownloadProgress, GameInfo, InstallState, Release, UninstallReport } from "./core/types";
import { getLang, initLang, LANG_LABELS, setLang, t, UI_LANGS, type UiLang } from "./i18n";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`нет элемента #${id}`);
  return el as T;
};

/** Названия языков — НА СВОЁМ языке (узнаётся мгновенно, как в переключателе). */
const LANG_NAMES: Record<string, string> = {
  en: "English",
  zh: "中文",
  ru: "Русский",
  es: "Español",
  pt: "Português",
  de: "Deutsch",
  ja: "日本語",
  fr: "Français",
  pl: "Polski",
  ko: "한국어",
  it: "Italiano",
};

const logEl = $("log");
const barEl = $("bar");
const statusEl = $("status");
const applyBtn = $<HTMLButtonElement>("install");
const uninstallBtn = $<HTMLButtonElement>("uninstall");
const langsEl = $("langs");
const uiLangEl = $<HTMLSelectElement>("ui-lang");

let game: GameInfo | null = null;
let state: InstallState | null = null;
let release: Release | null = null;
let busy = false;
/** Желаемое состояние языков (переключатели): true = должен стоять. */
const desired = new Map<string, boolean>();

const log = (text: string, kind: "ok" | "warn" | "err" | "" = ""): void => {
  const at = new Date().toTimeString().slice(0, 8);
  const line = document.createElement("div");
  if (kind) line.className = kind;
  line.textContent = `${at}  ${text}`;
  logEl.append(line);
  logEl.scrollTop = logEl.scrollHeight;
};

const setStatus = (text: string): void => {
  statusEl.textContent = text;
};

const assetSize = (asset: string): string => {
  const found = release?.assets.find((a) => a.name === asset);
  return found ? formatBytes(found.size) : "—";
};

const installedLangs = (): Set<string> => new Set((state?.langs ?? []).map((l) => l.lang));

/** Разница «желаемое vs установленное» — то, что сделает кнопка Apply. */
const diff = (): ReturnType<typeof diffLangs> => diffLangs(VOICE_LANGS, desired, installedLangs());

const refresh = (): void => {
  if (state) {
    const core = $("core-state");
    core.textContent = t(state.core ? "installed" : "not installed");
    core.classList.toggle("on", state.core);
  }
  const { install, remove } = diff();
  const changes = install.length + remove.length + (state?.core ? 0 : 1);
  applyBtn.disabled = busy || !game || changes === 0;
  applyBtn.textContent = busy ? t("Working…") : t("Apply changes");
  uninstallBtn.disabled = busy || !game || (!state?.core && !state?.langs.length);
  document.querySelectorAll<HTMLElement>(".lang-card").forEach((card) => {
    card.classList.toggle("busy", busy);
    const box = card.querySelector<HTMLInputElement>("input[role=switch]");
    if (box) box.disabled = busy;
  });
};

/** Флаг языка: SVG из лендинга (11 файлов, 24 КБ — копия в installer/public/flags). */
const flagFor = (lang: string): HTMLImageElement => {
  const img = document.createElement("img");
  img.className = "flag";
  img.src = `${import.meta.env.BASE_URL}flags/${lang}.svg`;
  img.alt = "";
  img.width = 22;
  img.height = 16;
  return img;
};

const langCard = (lang: string, files: number | undefined): HTMLElement => {
  const installed = files !== undefined;
  const want = desired.get(lang) ?? installed;
  const pending = want !== installed;

  const card = document.createElement("div");
  card.className = `lang-card${installed ? " installed" : ""}${pending ? " pending" : ""}`;
  card.dataset.lang = lang;

  const head = document.createElement("div");
  head.className = "lang-head";
  const name = document.createElement("span");
  name.className = "lang-name";
  name.textContent = LANG_NAMES[lang] ?? lang.toUpperCase();
  const code = document.createElement("span");
  code.className = "lang-code";
  code.textContent = lang.toUpperCase();
  name.append(code);
  head.append(flagFor(lang), name);

  const meta = document.createElement("div");
  meta.className = "lang-meta";
  if (pending) meta.classList.add(want ? "want" : "drop");
  meta.textContent = pending
    ? t(want ? "will be installed" : "will be removed")
    : installed
      ? t("installed · {{n}} files", { n: (files ?? 0).toLocaleString("en-US") })
      : t("not installed · {{size}}", { size: assetSize(voiceAsset(lang)) });

  // Переключатель: включён = язык должен стоять. Он НЕ качает сразу —
  // копит изменения, применяет кнопка «Применить изменения».
  const sw = document.createElement("label");
  sw.className = "switch";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.setAttribute("role", "switch");
  box.checked = want;
  box.dataset.lang = lang;
  box.addEventListener("change", () => {
    desired.set(lang, box.checked);
    renderLangs();
    refresh();
  });
  const track = document.createElement("span");
  track.className = "track";
  sw.append(box, track);

  card.append(head, meta, sw);
  return card;
};

const renderLangs = (): void => {
  const byLang = new Map((state?.langs ?? []).map((l) => [l.lang, l.files]));
  langsEl.replaceChildren();
  for (const lang of VOICE_LANGS) langsEl.append(langCard(lang, byLang.get(lang)));
};

/** Все статические подписи по `data-i18n` (при смене языка — заново). */
const applyI18n = (): void => {
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n ?? "");
  }
  document.documentElement.lang = getLang();
};

const renderAll = (): void => {
  applyI18n();
  renderLangs();
  refresh();
  if (state) {
    setStatus(
      state.core
        ? `${t("installed")}: core${state.langs.length ? ` + ${state.langs.map((l) => l.lang.toUpperCase()).join(", ")}` : ""}`
        : t("not installed"),
    );
  }
};

const detect = async (): Promise<void> => {
  setStatus(t("detecting game…"));
  try {
    game = await invoke<GameInfo | null>("find_game");
    if (!game) {
      $("game-path").textContent = t("game not found");
      $("game-build").textContent = "—";
      state = null;
      renderAll();
      log(t("game not found: official Steam version is required (App ID 2166470)"), "err");
      setStatus(t("game not found"));
      return;
    }
    $("game-path").textContent = game.path;
    $("game-build").textContent = game.build_id ?? "unknown";
    state = await invoke<InstallState>("scan_install", { game: game.path });
    // Желаемое состояние сбрасываем к факту: пользователь видит правду.
    desired.clear();
    for (const lang of VOICE_LANGS)
      desired.set(
        lang,
        state.langs.some((l) => l.lang === lang),
      );
    if (!release) {
      try {
        release = await fetchRelease();
      } catch (e) {
        log(`release info unavailable: ${String(e)}`, "warn");
      }
    }
    renderAll();
    log(`game: ${game.path}`, "ok");
  } catch (e) {
    log(`detect failed: ${String(e)}`, "err");
    setStatus("error");
  }
};

const fetchRelease = async (): Promise<Release> => {
  const resp = await fetch(RELEASE_API, { headers: { accept: "application/vnd.github+json" } });
  if (!resp.ok) throw new Error(`GitHub API ${resp.status}`);
  const data = (await resp.json()) as Release;
  log(`latest release: ${data.tag_name}`);
  return data;
};

const installAsset = async (assetName: string, rel: Release, appDir: string): Promise<void> => {
  if (!game) return;
  const asset = rel.assets.find((a) => a.name === assetName);
  if (!asset) throw new Error(`${assetName} not found in ${rel.tag_name}`);
  const dest = `${appDir}\\${asset.name}`;
  log(`${asset.name}: ${formatBytes(asset.size)} → ${dest}`);
  const started = Date.now();
  const bytes = await invoke<number>("download", { url: asset.browser_download_url, dest });
  const secs = Math.max(0.001, (Date.now() - started) / 1000);
  log(`  downloaded ${formatBytes(bytes)} in ${secs.toFixed(1)} s (${formatBytes(bytes / secs)}/s)`, "ok");
  const sha = await invoke<string>("sha256_file", { path: dest });
  log(`  sha256: ${sha}`);
  const files = await invoke<number>("extract", { archive: dest, dest: game.path });
  log(`  extracted ${files} files`, "ok");
};

/** Применить изменения: доставить отмеченное, удалить снятое, починить ядро. */
const applyChanges = async (): Promise<void> => {
  if (!game || !state) return;
  const { install, remove } = diff();
  const needCore = !state.core;
  if (!install.length && !remove.length && !needCore) return;

  const parts: string[] = [];
  if (needCore) parts.push("Core");
  if (install.length) parts.push(`+ ${install.map((l) => l.toUpperCase()).join(", ")}`);
  if (remove.length) parts.push(`− ${remove.map((l) => l.toUpperCase()).join(", ")}`);
  const question = `${t("Apply changes")}: ${parts.join("  ")}?`;
  if (!window.confirm(question)) return;

  setBusy();
  barEl.style.width = "0%";
  try {
    const appDir = await invoke<string>("app_dir");
    release = release ?? (await fetchRelease());
    let done = 0;
    const total = (needCore ? 1 : 0) + install.length + remove.length;

    if (needCore) {
      setStatus(t("installing {{i}}/{{n}}: {{what}}", { i: 1, n: total, what: "Core" }));
      await installAsset("TSSR-AI-Voice-Pack-main.7z", release, appDir);
      done += 1;
    }
    for (const lang of install) {
      setStatus(t("installing {{i}}/{{n}}: {{what}}", { i: done + 1, n: total, what: lang.toUpperCase() }));
      await installAsset(voiceAsset(lang), release, appDir);
      done += 1;
      barEl.style.width = `${percent(done, total).toFixed(1)}%`;
    }
    for (const lang of remove) {
      const files = await invoke<number>("remove_lang", { game: game.path, lang });
      log(`removed ${lang.toUpperCase()}: ${files} files`, "ok");
      done += 1;
      barEl.style.width = `${percent(done, total).toFixed(1)}%`;
    }
    log(t("done — launch the game and open the mod menu (badge in the top-right)"), "ok");
    setStatus("done");
    await detect();
  } catch (e) {
    log(`apply failed: ${String(e)}`, "err");
    setStatus("error");
  } finally {
    setBusy(false);
  }
};

const setBusy = (value = true): void => {
  busy = value;
  refresh();
};

const uninstallAll = async (): Promise<void> => {
  if (!game) return;
  const others = state?.other_mods ?? [];
  const note = others.length
    ? `\n\n${t("Other mods in mods/ ({{list}}) are kept, environment.txt stays.", { list: others.join(", ") })}`
    : "";
  if (!window.confirm(`${t("Uninstall TSSR AI Voice Pack from {{path}}?", { path: game.path })}${note}`)) return;
  setBusy();
  try {
    const r = await invoke<UninstallReport>("uninstall", { game: game.path });
    log(
      `uninstall: mod=${r.removed_mod ? "removed" : "absent"}, environment.txt=${
        r.removed_environment ? "removed" : r.kept_environment ? "kept (other mods)" : "absent"
      }`,
      "ok",
    );
    await detect();
  } catch (e) {
    log(`uninstall failed: ${String(e)}`, "err");
  } finally {
    setBusy(false);
  }
};

void listen<DownloadProgress>("download-progress", (event) => {
  const { downloaded, total } = event.payload;
  const pct = percent(downloaded, total);
  barEl.style.width = `${pct.toFixed(1)}%`;
  setStatus(`downloading… ${formatBytes(downloaded)}${total ? ` / ${formatBytes(total)}` : ""} (${pct.toFixed(0)}%)`);
});

/** Переключатель языка интерфейса — как на сайте (11 языков, выбор запоминается). */
const initUiLang = (): void => {
  for (const code of UI_LANGS) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = LANG_LABELS[code];
    uiLangEl.append(option);
  }
  uiLangEl.value = getLang();
  uiLangEl.addEventListener("change", () => {
    setLang(uiLangEl.value as UiLang);
    renderAll();
  });
};

$("redetect").addEventListener("click", () => void detect());
applyBtn.addEventListener("click", () => void applyChanges());
uninstallBtn.addEventListener("click", () => void uninstallAll());

// Внешние ссылки («спасибо»/обратная связь) — в системном браузере.
$("link-github").addEventListener("click", () => void openUrl(LINKS.github));
$("link-guide").addEventListener("click", () => void openUrl(LINKS.steamGuide));
$("link-issues").addEventListener("click", () => void openUrl(LINKS.issues));

void (async () => {
  // Язык Windows (Rust) → первичный язык интерфейса (см. initLang).
  const systemLocale = await invoke<string>("system_locale").catch(() => "");
  initLang(systemLocale);
  initUiLang();
  applyI18n();
  log("installer: core + voice packs, install / remove / uninstall");
  await detect();
})();
