import { useState } from "react";
import { useTranslation } from "react-i18next";

import { FEATURES } from "@/shared/config";
import { cx, Section } from "@/shared/ui";

import { styles } from "./Install.styles";

const DEFAULT_GAME_PATH = String.raw`C:\Program Files (x86)\Steam\steamapps\common\The Survival of Sarah Rose`;

export const ROOT = "Install";

export const Install = () => {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  // Бейдж показываем на русском для RU-аудитории, иначе на китайском (ZHO)
  const shotLang = i18n.language?.startsWith("ru") ? "russian" : "chinese";

  return (
    <Section title={t("Installation")} testId={ROOT}>
      <div className={cx(styles.panel)} data-testid={`${ROOT}--panel`}>
        <ol className={cx(styles.list)} data-testid={`${ROOT}--steps`}>
          <li className={cx(styles.item)} data-testid={`${ROOT}--step-1`}>
            {t(
              "Download the patch from GitHub Releases — start with main (required), then add the voice packs you want.",
            )}
          </li>
          <li className={cx(styles.item)} data-testid={`${ROOT}--step-2`}>
            {t(
              "Unpack main.7z into the game folder (where TheSurvivalofSarahRose.exe is): you get mods/tssr-ai-voice-pack and environment.txt. Voice packs — the same way.",
            )}
          </li>
          <li className={cx(styles.item)} data-testid={`${ROOT}--step-3`}>
            {t("Start the game, open the mod menu (badge in the top-right) and pick your language.")}
            <figure className={cx(styles.badgeWrap)} data-testid={`${ROOT}--badge`}>
              <img
                className={cx(styles.badgeImg)}
                src={`${import.meta.env.BASE_URL}shots/badge_${shotLang}.jpg`}
                alt={t("The badge in the top-right corner opens the mod menu")}
                loading="lazy"
              />
              <figcaption className={cx(styles.badgeCaption)}>
                {t("The badge in the top-right corner opens the mod menu")}
              </figcaption>
            </figure>
          </li>
        </ol>
        <details className={cx(styles.where)} data-testid={`${ROOT}--where`}>
          <summary className={cx(styles.whereTitle)}>{t("Where is the game folder?")}</summary>
          <p className={cx(styles.whereBody)}>
            {t("In Steam: Library → right-click the game → Manage → Browse local files. Or the default path:")}
          </p>
          <div className={cx(styles.pathRow)}>
            <code className={cx(styles.path)} data-testid={`${ROOT}--path`}>
              {DEFAULT_GAME_PATH}
            </code>
            <button
              type="button"
              className={cx(styles.copy)}
              data-testid={`${ROOT}--copy-path`}
              onClick={() => {
                void navigator.clipboard?.writeText(DEFAULT_GAME_PATH).then(
                  () => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  },
                  () => setCopied(false),
                );
              }}
            >
              {copied ? "✓" : t("Copy path")}
            </button>
          </div>
        </details>
        <div className={cx(styles.ctaRow)}>
          <a className={cx(styles.cta)} href="#download" data-testid={`${ROOT}--cta`}>
            {t("Open downloads")}
          </a>
          {FEATURES.vortex ? (
            <p className={cx(styles.hint)} data-testid={`${ROOT}--vortex-hint`}>
              {t("Using Vortex? Install the game extension once, then use “Install from file”.")}
            </p>
          ) : null}
        </div>
        <p className={cx(styles.note)} data-testid={`${ROOT}--note`}>
          {t("Requires the game bought on Steam. Unofficial fan patch, not affiliated with the developers.")}
        </p>
      </div>
    </Section>
  );
};
