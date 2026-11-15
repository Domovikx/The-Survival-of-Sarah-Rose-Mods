import { useTranslation } from "react-i18next";

import { LINKS } from "@/shared/config";
import { cx, SteamIcon } from "@/shared/ui";

import { styles } from "./Hero.styles";

export const Hero = () => {
  const { t } = useTranslation();

  return (
    <section className={cx(styles.hero)} data-testid="hero">
      <h1 className={cx(styles.title)} data-testid="hero-title">
        {t("The Survival of Sarah Rose — AI voice pack")}
      </h1>
      <p className={cx(styles.sub)} data-testid="hero-subtitle">
        {t("Unofficial fan patch: a full translation and AI voice acting for The Survival of Sarah Rose.")}
      </p>
      <div className={cx(styles.badges)} data-testid="hero-badges">
        <span className={cx(styles.badge)} data-testid="hero-badge-translate">
          {t("11 languages — RU complete, others demo up to the first choice")}
        </span>
        <span className={cx(styles.badge)} data-testid="hero-badge-voice">
          {t("Voice acting: demo 100% in 11 languages — 1 195 lines each (RU: 1 397)")}
        </span>
        <span className={cx(styles.badge)} data-testid="hero-badge-format">
          {t("Opus 24 kbps — 15–21 MB per language (demo)")}
        </span>
        <span className={cx(styles.badge)} data-testid="hero-badge-engine">
          {"Ren'Py 7.4.11 · Steam"}
        </span>
        <span className={cx(styles.badge, styles.badgeAge)} data-testid="hero-badge-age">
          {t("18+ adult content")}
        </span>
      </div>
      <div className={cx(styles.cta)} data-testid="hero-cta">
        <a className={cx(styles.steamBtn)} href={LINKS.steam} data-testid="hero-steam">
          <SteamIcon size={20} />
          {t("The Survival of Sarah Rose on Steam")}
        </a>
        <a className={cx(styles.mainBtn)} href={LINKS.nexus} data-testid="hero-download">
          {t("Download on Nexus Mods")}
        </a>
      </div>
      <p className={cx(styles.hint)} data-testid="hero-hint">
        {t("Requires a purchased copy of the game on Steam. Free, CC BY-NC 4.0.")}
      </p>
    </section>
  );
};
