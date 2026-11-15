import { useTranslation } from "react-i18next";

import { LANGS } from "@/shared/config/i18n";
import { cx, Section } from "@/shared/ui";

import { styles } from "./Downloads.styles";

/** Постоянный канал прямых ссылок: ассеты версии в GitHub-релизе.
 *  Обновляется вместе с релизом (тег = версия пакета). */
const RELEASE_BASE = "https://github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods/releases/download/v2026.11.15-0008";

const asset = (name: string): string => `${RELEASE_BASE}/TSSR-AI-Voice-Pack-${name}.7z`;

export const Downloads = () => {
  const { t } = useTranslation();

  return (
    <Section title={t("Download")} testId="downloads">
      <div className={cx(styles.panel)} data-testid="downloads-panel">
        <p className={cx(styles.lead)}>
          {t(
            "The patch is free. Please download from Nexus Mods when it is available: that is where the statistics and endorsements live, and they are what help other players find the patch. The links below are a backup channel for when Nexus or Vortex is not available for you.",
          )}
        </p>

        <div className={cx(styles.row)}>
          <a className={cx(styles.mainBtn)} href={asset("main")} data-testid="download-main" rel="noopener">
            {t("Download core (main.7z)")}
          </a>
          <span className={cx(styles.hint)}>{t("required — texts of 11 languages, fonts, mod menu")}</span>
        </div>

        <div>
          <p className={cx(styles.chipsLabel)}>{t("Voice packs — one per language (optional):")}</p>
          <div className={cx(styles.row)}>
            {LANGS.map((code) => (
              <a
                key={code}
                className={cx(styles.chip)}
                href={asset(`voice-${code}`)}
                data-testid={`download-voice-${code}`}
                rel="noopener"
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
