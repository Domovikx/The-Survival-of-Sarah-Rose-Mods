import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatBytes, percent } from "@/core/format";
import { fallbackRelease, RELEASE_API, VOICE_LANGS, voiceAsset } from "@/core/pack";
import { diffLangs } from "@/core/plan";
import type { DownloadProgress, GameInfo, InstallState, Release, UninstallReport } from "@/core/types";
import { t } from "@/i18n";

export type ConfirmRequest = {
  title: string;
  detail?: string;
  confirmLabel: string;
  danger?: boolean;
  run: () => void;
};

/**
 * Всё состояние установщика в одном хуке: данные, журнал, занятость, прогресс
 * и подтверждения. Компоненты остаются «глупыми» — только разметка и стили.
 */
export const useInstaller = () => {
  const [game, setGame] = useState<GameInfo | null>(null);
  const [state, setState] = useState<InstallState | null>(null);
  const [release, setRelease] = useState<Release | null>(null);
  /** Желаемое состояние языков (тумблеры): true = должен стоять. */
  const [desired, setDesired] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [lines, setLines] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  /** Что качается прямо сейчас: код языка (null = ядро) и процент файла. */
  const [active, setActive] = useState<{ lang: string | null; pct: number } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [detected, setDetected] = useState(false);

  const log = useCallback((text: string) => {
    const at = new Date().toTimeString().slice(0, 8);
    setLines((prev) => [...prev, `${at}  ${text}`]);
  }, []);

  const installed = useMemo(() => new Set((state?.langs ?? []).map((l) => l.lang)), [state]);
  const diff = useMemo(() => diffLangs(VOICE_LANGS, desired, installed), [desired, installed]);
  const changes = diff.install.length + diff.remove.length + (state && !state.core ? 1 : 0);

  const assetSize = useCallback(
    (asset: string): string => {
      const found = release?.assets.find((a) => a.name === asset);
      return found ? formatBytes(found.size) : "—";
    },
    [release],
  );

  const fetchRelease = useCallback(async (): Promise<Release> => {
    try {
      const resp = await fetch(RELEASE_API, { headers: { accept: "application/vnd.github+json" } });
      if (!resp.ok) throw new Error(`GitHub API ${resp.status}`);
      const data = (await resp.json()) as Release;
      log(`latest release: ${data.tag_name}`);
      return data;
    } catch (e) {
      // Лимит API не должен ломать установку: качаем по прямой ссылке latest.
      log(`release info unavailable: ${String(e)} — using direct links`);
      return fallbackRelease();
    }
  }, [log]);

  const detect = useCallback(async () => {
    setStatus(t("detecting game…"));
    try {
      const found = await invoke<GameInfo | null>("find_game");
      setGame(found);
      if (!found) {
        setState(null);
        setDetected(true);
        log(t("game not found: official Steam version is required (App ID 2166470)"));
        setStatus(t("game not found"));
        return;
      }
      const inv = await invoke<InstallState>("scan_install", { game: found.path });
      setState(inv);
      setDesired(new Map(VOICE_LANGS.map((lang) => [lang, inv.langs.some((l) => l.lang === lang)])));
      setDetected(true);
      setStatus(
        inv.core
          ? inv.langs.length
            ? t("main pack + {{n}} voice packs", { n: inv.langs.length })
            : t("main pack installed, no voice packs")
          : t("not installed"),
      );
      log(`game: ${found.path}`);
      setRelease((prev) => prev ?? null);
      if (!release) {
        try {
          setRelease(await fetchRelease());
        } catch (e) {
          log(`release info unavailable: ${String(e)}`);
        }
      }
    } catch (e) {
      log(`detect failed: ${String(e)}`);
      setStatus(t("error"));
    }
  }, [fetchRelease, log, release]);

  // План применения: сколько шагов всего и сколько уже закрыто. Нужен, чтобы
  // полоса показывала ОБЩИЙ прогресс (ядро + языки), а не прыгала 0..100 на
  // каждом файле; поле в ref — событие приходит вне рендера.
  const plan = useRef({ done: 0, total: 0 });
  const label = useRef<string | null>(null);

  // Прогресс скачивания приходит событием из Rust — обновляем полосу и процент.
  useEffect(() => {
    const un = listen<DownloadProgress>("download-progress", (event) => {
      const { downloaded, total } = event.payload;
      const size = total ?? 0;
      const pct = percent(downloaded, size);
      const frac = size > 0 ? downloaded / size : 0;
      const { done, total: steps } = plan.current;
      if (steps > 0) setProgress(Math.min(100, ((done + frac) / steps) * 100));
      setActive((prev) => (prev ? { ...prev, pct } : prev));
      const what = label.current ? label.current.toUpperCase() : t("Main pack");
      setStatus(
        size > 0
          ? t("Downloading {{what}}: {{done}} / {{total}} ({{n}}%)", {
              what,
              done: formatBytes(downloaded),
              total: formatBytes(size),
              n: pct.toFixed(0),
            })
          : t("Downloading {{what}}: {{done}} ({{n}}%)", {
              what,
              done: formatBytes(downloaded),
              n: pct.toFixed(0),
            }),
      );
    });
    return () => {
      void un.then((off) => off());
    };
  }, []);

  const installAsset = useCallback(
    async (assetName: string, rel: Release, appDir: string, what: string | null) => {
      if (!game) return;
      const asset = rel.assets.find((a) => a.name === assetName);
      if (!asset) throw new Error(`${assetName} not found in ${rel.tag_name}`);
      const dest = `${appDir}\\${asset.name}`;
      log(`${asset.name}: ${formatBytes(asset.size)}`);
      label.current = what;
      setActive({ lang: what, pct: 0 });
      const started = Date.now();
      const bytes = await invoke<number>("download", { url: asset.browser_download_url, dest });
      const secs = Math.max(0.001, (Date.now() - started) / 1000);
      log(`  ${formatBytes(bytes)} за ${secs.toFixed(1)} с (${formatBytes(bytes / secs)}/s)`);
      const sha = await invoke<string>("sha256_file", { path: dest });
      log(`  sha256 ${sha}`);
      setStatus(t("extracting…"));
      const files = await invoke<number>("extract", { archive: dest, dest: game.path });
      log(`  распаковано файлов: ${files}`);
      label.current = null;
      setActive(null);
    },
    [game, log],
  );

  const runApply = useCallback(async () => {
    if (!game || !state) return;
    const needCore = !state.core;
    const { install, remove } = diff;
    if (!needCore && !install.length && !remove.length) return;
    setBusy(true);
    setProgress(0);
    setActive(null);
    try {
      const appDir = await invoke<string>("app_dir");
      const rel = release ?? (await fetchRelease());
      const total = (needCore ? 1 : 0) + install.length + remove.length;
      plan.current = { done: 0, total };
      let done = 0;
      if (needCore) {
        setStatus(t("installing {{i}}/{{n}}: {{what}}", { i: 1, n: total, what: t("Main pack") }));
        await installAsset("TSSR-AI-Voice-Pack-main.7z", rel, appDir, null);
        plan.current.done = ++done;
      }
      for (const lang of install) {
        setStatus(t("installing {{i}}/{{n}}: {{what}}", { i: done + 1, n: total, what: lang.toUpperCase() }));
        await installAsset(voiceAsset(lang), rel, appDir, lang);
        plan.current.done = ++done;
      }
      for (const lang of remove) {
        const files = await invoke<number>("remove_lang", { game: game.path, lang });
        log(`removed ${lang.toUpperCase()}: ${files} files`);
        plan.current.done = ++done;
      }
      log(t("done — launch the game and open the mod menu (badge in the top-right)"));
      setStatus(t("done"));
      await detect();
    } catch (e) {
      log(`apply failed: ${String(e)}`);
      setStatus(t("error"));
      setProgress(100);
    } finally {
      setActive(null);
      label.current = null;
      plan.current = { done: 0, total: 0 };
      setBusy(false);
    }
  }, [detect, diff, fetchRelease, game, installAsset, log, release, state]);

  const apply = useCallback(() => {
    if (!state) return;
    const { remove } = diff;
    if (!remove.length) {
      void runApply();
      return;
    }
    setConfirm({
      title: `${t("Apply changes")}?`,
      detail: `${remove.map((l) => l.toUpperCase()).join(", ")} — ${t("will be removed")}`,
      confirmLabel: t("Apply changes"),
      danger: true,
      run: () => void runApply(),
    });
  }, [diff, runApply, state]);

  const uninstall = useCallback(() => {
    if (!game) return;
    const others = state?.other_mods ?? [];
    setConfirm({
      title: t("Uninstall TSSR AI Voice Pack from {{path}}?", { path: game.path }),
      detail: others.length
        ? t("Other mods in mods/ ({{list}}) are kept, environment.txt stays.", { list: others.join(", ") })
        : undefined,
      confirmLabel: t("Uninstall mod"),
      danger: true,
      run: () => {
        void (async () => {
          setBusy(true);
          try {
            const r = await invoke<UninstallReport>("uninstall", { game: game.path });
            log(
              `uninstall: mod=${r.removed_mod ? "removed" : "absent"}, env=${r.removed_environment ? "removed" : "present"}`,
            );
            await detect();
          } catch (e) {
            log(`uninstall failed: ${String(e)}`);
          } finally {
            setBusy(false);
          }
        })();
      },
    });
  }, [detect, game, log, state]);

  const toggleLang = useCallback((lang: string, value: boolean) => {
    setDesired((prev) => new Map(prev).set(lang, value));
  }, []);

  return {
    game,
    state,
    release,
    desired,
    lines,
    busy,
    status,
    progress,
    active,
    confirm,
    detected,
    diff,
    changes,
    assetSize,
    detect,
    apply,
    uninstall,
    toggleLang,
    closeConfirm: () => setConfirm(null),
  };
};
