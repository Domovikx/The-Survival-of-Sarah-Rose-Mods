import { useTranslation } from "react-i18next";

import { LINKS } from "@/shared/config";
import { cx, Section } from "@/shared/ui";

import { styles } from "./Support.styles";

/** Ссылка на руководство в Steam (лайк/оценка) — витрина для новых игроков. */
const STEAM_GUIDE = "https://steamcommunity.com/sharedfiles/filedetails/?id=3733106761";
const BOOSTY = "https://boosty.to/domovikx";
const KOFI = "https://ko-fi.com/domovikx";

export const Support = () => {
  const { t } = useTranslation();

  return (
    <Section title={t("Support the project")} testId="support">
      <div className={cx(styles.panel)} data-testid="support-panel">
        <p className={cx(styles.lead)}>
          {t(
            "The patch is non-commercial and made by one person in their spare time. If it has been useful, here is what really helps:",
          )}
        </p>

        <ul className={cx(styles.list)}>
          <li className={cx(styles.item)}>
            {t("Endorse it on Nexus Mods — that is how other players find the patch")}
          </li>
          <li className={cx(styles.item)}>{t("Rate the Steam guide — that is how newcomers find it")}</li>
          <li className={cx(styles.item)}>
            {t("A donation on Boosty or Ko-fi — it pays for the AI and the hours behind the voice")}
          </li>
        </ul>

        <div className={cx(styles.row)}>
          <a className={cx(styles.btn, styles.btnAccent)} href={LINKS.nexus} data-testid="support-nexus" rel="noopener">
            {t("Endorse on Nexus")}
          </a>
          <a className={cx(styles.btn)} href={STEAM_GUIDE} data-testid="support-steam" rel="noopener">
            {t("Steam guide")}
          </a>
          <a className={cx(styles.btn)} href={BOOSTY} data-testid="support-boosty" rel="noopener">
            {"Boosty"}
          </a>
          <a className={cx(styles.btn)} href={KOFI} data-testid="support-kofi" rel="noopener">
            {"Ko-fi"}
          </a>
        </div>

        <p className={cx(styles.thanks)}>
          {t("Thank you. Even one endorsement is visible, and a donation is literally the next lines of voice acting.")}
        </p>
      </div>
    </Section>
  );
};
