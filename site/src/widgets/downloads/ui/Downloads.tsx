import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import { LANGS } from "@/shared/config";
import { cx, Section } from "@/shared/ui";

import { styles } from "./Downloads.styles";

/** Постоянный канал прямых ссылок: ассеты версии в GitHub-релизе.
 *  Обновляется вместе с релизом (тег = версия пакета). */
const RELEASE_BASE = "https://github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods/releases/download/v2026.11.15-0008";

const asset = (name: string): string => `${RELEASE_BASE}/TSSR-AI-Voice-Pack-${name}.7z`;

/**
 * Сколько ссылка остаётся заблокированной после нажатия.
 *
 * Зачем: браузер НЕ сообщает сайту ничего о ходе и конце скачивания (это
 * обычная ссылка на .7z). Без блокировки человек видит «ничего не происходит» и
 * жмёт ещё и ещё — а каждый клик запускает новую закачку того же файла. Сейчас
 * это 5 МБ и 15–21 МБ, дальше файлы будут под гигабайт: пачка одинаковых
 * закачек = потраченный трафик и забитый диск.
 */
const COOLDOWN_MS = 20_000;

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

  /** Возвращает false, если нажатие надо погасить (файл уже качается). */
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
    <Section title={t("Download")} testId="downloads">
      <div className={cx(styles.panel)} data-testid="downloads-panel">
        <p className={cx(styles.lead)}>
          {t(
            "The patch is free. Please download from Nexus Mods when it is available: that is where the statistics and endorsements live, and they are what help other players find the patch. The links below are a backup channel for when Nexus or Vortex is not available for you.",
          )}
        </p>

        <div className={cx(styles.row)}>
          <a
            className={cx(styles.mainBtn, isPending("main") && styles.linkBusy)}
            href={asset("main")}
            data-testid="download-main"
            rel="noopener"
            {...linkState("main")}
          >
            {isPending("main") ? t("Downloading…") : t("Download core (main.7z)")}
          </a>
          <span className={cx(styles.hint)}>{t("required — texts of 11 languages, fonts, mod menu")}</span>
        </div>

        <p className={cx(styles.status)} role="status" aria-live="polite" data-testid="downloads-status">
          {pending.length ? t("Download started — wait for the browser to finish. Clicking again is not needed.") : ""}
        </p>

        <div>
          <p className={cx(styles.chipsLabel)}>{t("Voice packs — one per language (optional):")}</p>
          <div className={cx(styles.row)}>
            {LANGS.map((code) => (
              <a
                key={code}
                className={cx(styles.chip, isPending(`voice-${code}`) && styles.linkBusy)}
                href={asset(`voice-${code}`)}
                data-testid={`download-voice-${code}`}
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
        <p className={cx(styles.note)}>
          {t("The main page and updates live on Nexus Mods; here is a backup copy of the current version.")}
        </p>
      </div>
    </Section>
  );
};
