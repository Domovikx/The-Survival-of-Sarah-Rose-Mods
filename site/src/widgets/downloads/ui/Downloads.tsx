import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import { FEATURES, INSTALLER_ASSET, installerSource, LANGS, packAsset } from "@/shared/config";
import { fetchAssetSizes, fetchLocalSize, formatSize, type AssetSizes } from "@/shared/lib";
import { cx, Section } from "@/shared/ui";

import { styles } from "./Downloads.styles";

/** Пауза после клика: браузер не сообщает о конце закачки, без неё качают пачками. */
const COOLDOWN_MS = 20_000;

export const ROOT = "Downloads";

/**
 * Скачивание: ОДНА панель (как в остальных секциях) и два пути внутри —
 * инсталлятор (акцент) и ручные архивы (тихий). Раньше это были две плавающие
 * карточки с акцентной рамкой у одной из них: блок выбивался из лендинга.
 */
export const Downloads = () => {
  const { t, i18n } = useTranslation();
  const installer = installerSource();
  /** Размеры ассетов релиза: показываем до клика (ошибки — молча, без размеров). */
  const [sizes, setSizes] = useState<AssetSizes>({});
  useEffect(() => {
    let alive = true;
    void (async () => {
      const map = await fetchAssetSizes();
      // В dev ассета в релизе ещё нет — берём размер локального файла,
      // чтобы «сколько качать» было видно до публикации.
      if (installer.mode === "dev" && !map[INSTALLER_ASSET]) {
        const local = await fetchLocalSize(installer.url);
        if (local) map[INSTALLER_ASSET] = local;
      }
      if (alive) setSizes(map);
    })();
    return () => {
      alive = false;
    };
  }, [installer.mode, installer.url]);

  const sizeText = (asset: string): string | null => formatSize(sizes[asset], i18n.language);

  /** Ключи (main/voice-ru…) с активным таймером блокировки. */
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [pending, setPending] = useState<readonly string[]>([]);

  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const timer of running.values()) clearTimeout(timer);
      running.clear();
    };
  }, []);

  const startDownload = useCallback((event: MouseEvent<HTMLAnchorElement>, key: string): void => {
    if (timers.current.has(key)) {
      event.preventDefault();
      return;
    }
    setPending((prev) => [...prev, key]);
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key);
        setPending((prev) => prev.filter((item) => item !== key));
      }, COOLDOWN_MS),
    );
  }, []);

  const isPending = (key: string): boolean => pending.includes(key);

  const linkState = (key: string) =>
    ({
      "aria-busy": isPending(key),
      "aria-disabled": isPending(key),
      "data-state": isPending(key) ? "pending" : "idle",
      "onClick": (event: MouseEvent<HTMLAnchorElement>) => startDownload(event, key),
      "tabIndex": isPending(key) ? -1 : undefined,
    }) as const;

  return (
    <Section id="download" title={t("Download")} testId={ROOT}>
      <div className={cx(styles.panel)} data-testid={`${ROOT}--panel`}>
        <p className={cx(styles.lead)}>
          {t(
            "The patch is free. All files come straight from the GitHub Releases of the project — no account needed. If a download does not start, open the release page.",
          )}
        </p>

        <div className={cx(styles.options)}>
          {FEATURES.installer ? (
            <div className={cx(styles.option)} data-testid={`${ROOT}--installer-card`}>
              <span className={cx(styles.tag)}>{t("Recommended")}</span>
              <h3 className={cx(styles.optionTitle)}>{t("Installer for Windows")}</h3>
              <p className={cx(styles.optionText)}>
                {t("Finds the game automatically, installs only the packs you tick, uninstalls cleanly.")}
              </p>
              <a
                className={cx(styles.primaryBtn, isPending("installer") && styles.linkBusy)}
                href={installer.url}
                data-testid={`${ROOT}--installer`}
                rel="noopener"
                {...linkState("installer")}
              >
                {isPending("installer") ? t("Downloading…") : t("Download installer (.exe)")}
              </a>
              <p className={cx(styles.meta)}>
                {[t("Windows 10/11 · official Steam version only"), sizeText("TSSR-AI-Voice-Pack-Installer.exe")]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {installer.mode === "dev" ? (
                <span className={cx(styles.note)} data-testid={`${ROOT}--installer-mode`}>
                  {"dev build · local file"}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className={cx(styles.option, styles.optionManual)} data-testid={`${ROOT}--manual-card`}>
            <span className={cx(styles.tagMuted)}>{t("Manual")}</span>
            <h3 className={cx(styles.optionTitle)}>{t("Core + voice packs")}</h3>
            <div className={cx(styles.row)}>
              <a
                className={cx(styles.secondaryBtn, isPending("main") && styles.linkBusy)}
                href={packAsset("main")}
                data-testid={`${ROOT}--main`}
                rel="noopener"
                {...linkState("main")}
              >
                {isPending("main") ? t("Downloading…") : t("Download core (main.7z)")}
              </a>
              <span className={cx(styles.meta)}>
                {[t("required — all translations, fonts, mod menu"), sizeText("TSSR-AI-Voice-Pack-main.7z")]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          </div>
        </div>

        <div className={cx(styles.shared)}>
          <p className={cx(styles.chipsLabel)}>{t("Voice packs — one per language (optional):")}</p>
          <div className={cx(styles.chips)}>
            {LANGS.map((code) => (
              <a
                key={code}
                className={cx(styles.chip, isPending(`voice-${code}`) && styles.linkBusy)}
                href={packAsset(`voice-${code}`)}
                data-testid={`${ROOT}--voice-${code}`}
                rel="noopener"
                {...linkState(`voice-${code}`)}
              >
                <b className={cx(styles.chipCode)}>{code.toUpperCase()}</b>
                <span className={cx(styles.chipSize)}>{sizeText(`TSSR-AI-Voice-Pack-voice-${code}.7z`) ?? "—"}</span>
              </a>
            ))}
          </div>
          <p className={cx(styles.optionText)}>
            {t(
              "Unpack main.7z into the game folder (next to TheSurvivalofSarahRose.exe), then the voice packs you want. The badge in the top-right corner opens the mod menu.",
            )}
          </p>
        </div>

        <p className={cx(styles.status)} role="status" aria-live="polite" data-testid={`${ROOT}--status`}>
          {pending.length ? t("Download started — wait for the browser to finish. Clicking again is not needed.") : ""}
        </p>
      </div>
    </Section>
  );
};
