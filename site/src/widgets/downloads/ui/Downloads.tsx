import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import { LANGS, packAsset } from "@/shared/config";
import { cx, Section } from "@/shared/ui";

import { styles } from "./Downloads.styles";

/** Пауза после клика: браузер не сообщает о конце закачки, без неё качают пачками. */
const COOLDOWN_MS = 20_000;

export const ROOT = "Downloads";

export const Downloads = () => {
  const { t } = useTranslation();
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

  /** Общие атрибуты ссылки: состояние для стилей, скринридера и тестов. */
  const linkState = (key: string) => {
    const busy = isPending(key);
    return {
      "aria-busy": busy,
      "aria-disabled": busy,
      "data-state": busy ? "pending" : "idle",
      "onClick": (event: MouseEvent<HTMLAnchorElement>) => startDownload(event, key),
      "tabIndex": busy ? -1 : undefined,
    } as const;
  };

  return (
    <Section id="download" title={t("Download")} testId={ROOT}>
      <div className={cx(styles.panel)} data-testid={`${ROOT}--panel`}>
        <p className={cx(styles.lead)}>
          {t(
            "The patch is free. All files come straight from the GitHub Releases of the project — no account needed. If a download does not start, open the release page.",
          )}
        </p>

        <div className={cx(styles.row)}>
          <a
            className={cx(styles.mainBtn, isPending("main") && styles.linkBusy)}
            href={packAsset("main")}
            data-testid={`${ROOT}--main`}
            rel="noopener"
            {...linkState("main")}
          >
            {isPending("main") ? t("Downloading…") : t("Download core (main.7z)")}
          </a>
          <span className={cx(styles.hint)}>{t("required — texts of 10 languages, fonts, mod menu")}</span>
        </div>

        <p className={cx(styles.status)} role="status" aria-live="polite" data-testid={`${ROOT}--status`}>
          {pending.length ? t("Download started — wait for the browser to finish. Clicking again is not needed.") : ""}
        </p>

        <div>
          <p className={cx(styles.chipsLabel)}>{t("Voice packs — one per language (optional):")}</p>
          <div className={cx(styles.row)}>
            {LANGS.map((code) => (
              <a
                key={code}
                className={cx(styles.chip, isPending(`voice-${code}`) && styles.linkBusy)}
                href={packAsset(`voice-${code}`)}
                data-testid={`${ROOT}--voice-${code}`}
                rel="noopener"
                {...linkState(`voice-${code}`)}
              >
                {code.toUpperCase()}
              </a>
            ))}
          </div>
        </div>

        <p className={cx(styles.hint)}>
          {t(
            "Unpack main.7z into the game folder (next to TheSurvivalofSarahRose.exe), then the voice packs you want. The badge in the top-right corner opens the mod menu.",
          )}
        </p>
      </div>
    </Section>
  );
};
