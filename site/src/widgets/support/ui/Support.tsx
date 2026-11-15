import { useTranslation } from "react-i18next";

import { LINKS } from "@/shared/config";
import { cx, Section } from "@/shared/ui";

import { styles } from "./Support.styles";

/** Ссылка на руководство в Steam (лайк/оценка) — витрина для новых игроков. */
const STEAM_GUIDE = "https://steamcommunity.com/sharedfiles/filedetails/?id=3733106761";

/**
 * Бесплатные действия (endorse + оценка гайда) — стоят сразу после демо:
 * это пик ценности и действие без затрат, ровно тот порядок, который в
 * исследованиях конверсии даёт лучший отклик. Донат — отдельный блок ниже.
 */
export const Support = () => {
  const { t } = useTranslation();

  return (
    <Section id="support" title={t("Support the project")} testId="support">
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
        </ul>

        <div className={cx(styles.row)}>
          <a className={cx(styles.btn, styles.btnAccent)} href={LINKS.nexus} data-testid="support-nexus" rel="noopener">
            {t("Endorse on Nexus")}
          </a>
          <a className={cx(styles.btn)} href={STEAM_GUIDE} data-testid="support-steam" rel="noopener">
            {t("Steam guide")}
          </a>
        </div>
      </div>
    </Section>
  );
};
