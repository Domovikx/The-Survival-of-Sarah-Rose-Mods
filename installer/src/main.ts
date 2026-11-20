import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { formatBytes, percent } from "./core/format";
import { LINKS, RELEASE_API, VOICE_LANGS, voiceAsset } from "./core/pack";
import { openUrl } from "@tauri-apps/plugin-opener";
import { buildPlan, describeItem, type InstallItem } from "./core/plan";
import type { DownloadProgress, GameInfo, InstallState, Release, UninstallReport } from "./core/types";
import { getLang, initLang, LANG_LABELS, setLang, t, UI_LANGS, type UiLang } from "./i18n";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`нет элемента #${id}`);
  return el as T;
};

/** Названия языков — НА СВОЁМ языке (как в переключателе и на сайте):
 *  узнаётся мгновенно, не зависит от языка интерфейса. */
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
const installBtn = $<HTMLButtonElement>("install");
const uninstallBtn = $<HTMLButtonElement>("uninstall");
const langsEl = $("langs");
const uiLangEl = $<HTMLSelectElement>("ui-lang");

let game: GameInfo | null = null;
let state: InstallState | null = null;
let release: Release | null = null;
let busy = false;
/** Отмеченные к установке языки (уже стоящие сюда не попадают). */
const selected = new Set<string>();

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

const setBusy = (value: boolean): void => {
  busy = value;
  refresh();
};

const planNow = (): InstallItem[] =>
  state
    ? buildPlan({
        coreInstalled: state.core,
        selected: [...selected],
        installed: state.langs.map((l) => l.lang),
      })
    : [];

/** Все статические подписи по `data-i18n` (при смене языка — заново). */
const applyI18n = (): void => {
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n ?? "");
  }
  document.documentElement.lang = getLang();
};

const refresh = (): void => {
  if (state) {
    const core = $("core-state");
    core.textContent = t(state.core ? "installed" : "not installed");
    core.classList.toggle("on", state.core);
  }
  const plan = planNow();
  const toInstall = plan.filter((i) => i.kind === "lang").length;
  installBtn.disabled = busy || !game || plan.length === 0;
  installBtn.textContent = busy
    ? t("Working…")
    : toInstall > 0
      ? t("Install selected ({{n}})", { n: toInstall })
      : !state?.core
        ? t("Install core")
        : t("Install selected");
  uninstallBtn.disabled = busy || !game || (!state?.core && !state?.langs.length);
  document.querySelectorAll<HTMLElement>(".lang-card").forEach((card) => {
    card.classList.toggle("busy", busy);
    const box = card.querySelector<HTMLInputElement>("input[type=checkbox]");
    if (box) box.disabled = busy || box.dataset.installed === "1";
  });
};

const langCard = (lang: string, installedFiles: number | undefined): HTMLElement => {
  const installed = installedFiles !== undefined;
  const card = document.createElement("div");
  card.className = `lang-card${installed ? " installed" : ""}`;
  card.dataset.lang = lang;

  const pick = document.createElement("label");
  pick.className = "lang-pick";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.dataset.lang = lang;
  box.dataset.installed = installed ? "1" : "0";
  box.checked = installed || selected.has(lang);
  box.disabled = busy || installed;
  box.addEventListener("change", () => {
    if (box.checked) selected.add(lang);
    else selected.delete(lang);
    refresh();
  });

  const name = document.createElement("span");
  name.className = "lang-name";
  name.textContent = LANG_NAMES[lang] ?? lang.toUpperCase();
  const code = document.createElement("span");
  code.className = "lang-code";
  code.textContent = lang.toUpperCase();
  name.append(code);
  pick.append(box, name);

  const meta = document.createElement("div");
  meta.className = "lang-meta";
  meta.textContent = installed
    ? t("installed · {{n}} files", { n: (installedFiles ?? 0).toLocaleString("en-US") })
    : t("not installed · {{size}}", { size: assetSize(voiceAsset(lang)) });

  const action = document.createElement("div");
  action.className = "lang-action";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn tiny";
  remove.textContent = t("Remove");
  remove.hidden = !installed;
  remove.addEventListener("click", () => void removeLang(lang));
  action.append(remove);

  card.append(pick, meta, action);
  return card;
};

const renderLangs = (): void => {
  const byLang = new Map((state?.langs ?? []).map((l) => [l.lang, l.files]));
  langsEl.replaceChildren();
  for (const lang of VOICE_LANGS) langsEl.append(langCard(lang, byLang.get(lang)));
};

/** Полный перерисов: язык интерфейса мог смениться, подписи — заново. */
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
    for (const l of state.langs) selected.delete(l.lang);
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

const installItem = async (item: InstallItem, rel: Release, appDir: string): Promise<void> => {
  if (!game) return;
  const asset = rel.assets.find((a) => a.name === item.asset);
  if (!asset) throw new Error(`${item.asset} not found in ${rel.tag_name}`);
  const dest = `${appDir}\\${asset.name}`;
  log(`${describeItem(item)}: ${formatBytes(asset.size)} → ${dest}`);
  const started = Date.now();
  const bytes = await invoke<number>("download", { url: asset.browser_download_url, dest });
  const secs = Math.max(0.001, (Date.now() - started) / 1000);
  log(`  downloaded ${formatBytes(bytes)} in ${secs.toFixed(1)} s (${formatBytes(bytes / secs)}/s)`, "ok");
  const sha = await invoke<string>("sha256_file", { path: dest });
  log(`  sha256: ${sha}`);
  const files = await invoke<number>("extract", { archive: dest, dest: game.path });
  log(`  extracted ${files} files`, "ok");
};

const installSelected = async (): Promise<void> => {
  if (!game || !state) return;
  setBusy(true);
  barEl.style.width = "0%";
  try {
    const appDir = await invoke<string>("app_dir");
    release = release ?? (await fetchRelease());
    const plan = planNow();
    if (!plan.length) {
      log("nothing to do: everything selected is already installed", "warn");
      return;
    }
    log(`plan: ${plan.map(describeItem).join(" → ")}`);
    let done = 0;
    for (const item of plan) {
      setStatus(t("installing {{i}}/{{n}}: {{what}}", { i: done + 1, n: plan.length, what: describeItem(item) }));
      await installItem(item, release, appDir);
      done += 1;
      barEl.style.width = `${percent(done, plan.length).toFixed(1)}%`;
    }
    log(t("done — launch the game and open the mod menu (badge in the top-right)"), "ok");
    setStatus("done");
    selected.clear();
    await detect();
  } catch (e) {
    log(`install failed: ${String(e)}`, "err");
    setStatus("error");
  } finally {
    setBusy(false);
  }
};

const removeLang = async (lang: string): Promise<void> => {
  if (!game) return;
  const question = t("Remove {{name}} ({{code}}) voice pack?", {
    name: LANG_NAMES[lang] ?? lang,
    code: lang.toUpperCase(),
  });
  if (!window.confirm(question)) return;
  setBusy(true);
  try {
    const files = await invoke<number>("remove_lang", { game: game.path, lang });
    log(`removed ${lang.toUpperCase()}: ${files} files`, "ok");
    await detect();
  } catch (e) {
    log(`remove failed: ${String(e)}`, "err");
  } finally {
    setBusy(false);
  }
};

const uninstallAll = async (): Promise<void> => {
  if (!game) return;
  const others = state?.other_mods ?? [];
  const note = others.length
    ? `\n\n${t("Other mods in mods/ ({{list}}) are kept, environment.txt stays.", { list: others.join(", ") })}`
    : "";
  if (!window.confirm(`${t("Uninstall TSSR AI Voice Pack from {{path}}?", { path: game.path })}${note}`)) return;
  setBusy(true);
  try {
    const r = await invoke<UninstallReport>("uninstall", { game: game.path });
    log(
      `uninstall: mod=${r.removed_mod ? "removed" : "absent"}, environment.txt=${
        r.removed_environment ? "removed" : r.kept_environment ? "kept (other mods)" : "absent"
      }`,
      "ok",
    );
    selected.clear();
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
installBtn.addEventListener("click", () => void installSelected());
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
  log("installer prototype: core + voice packs, install / remove language / uninstall");
  await detect();
})();
