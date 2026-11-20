import { useTranslation } from "react-i18next";

import { LINKS } from "@/shared/config";
import { cx, SteamIcon } from "@/shared/ui";

import { styles } from "./Hero.styles";

export const ROOT = "Hero";

export const Hero = () => {
  const { t } = useTranslation();

  return (
    <section className={cx(styles.hero)} data-testid={ROOT}>
      <h1 className={cx(styles.title)} data-testid={`${ROOT}--title`}>
        {t("The Survival of Sarah Rose — AI voice pack")}
      </h1>
      <p className={cx(styles.sub)} data-testid={`${ROOT}--subtitle`}>
        {t("Unofficial fan patch: a full translation and AI voice acting for The Survival of Sarah Rose.")}
      </p>
      <div className={cx(styles.badges)} data-testid={`${ROOT}--badges`}>
        <span className={cx(styles.badge)} data-testid={`${ROOT}--badge-text`}>
          {t("Full text in 10 languages")}
        </span>
        <span className={cx(styles.badge)} data-testid={`${ROOT}--badge-voice`}>
          {t("Demo voice in 11 languages")}
        </span>
        <span className={cx(styles.badge, styles.badgeAge)} data-testid={`${ROOT}--badge-age`}>
          {t("18+ adult content")}
        </span>
      </div>
      <div className={cx(styles.cta)} data-testid={`${ROOT}--cta`}>
        <a className={cx(styles.steamBtn)} href={LINKS.steam} data-testid={`${ROOT}--steam`}>
          <SteamIcon size={20} />
          {t("The Survival of Sarah Rose on Steam")}
        </a>
        <a className={cx(styles.mainBtn)} href="#download" data-testid={`${ROOT}--download`}>
          {t("Download the patch")}
        </a>
      </div>
      <p className={cx(styles.hint)} data-testid={`${ROOT}--hint`}>
        {t("Requires a purchased copy of the game on Steam. Free, CC BY-NC 4.0.")}
      </p>
    </section>
  );
};
