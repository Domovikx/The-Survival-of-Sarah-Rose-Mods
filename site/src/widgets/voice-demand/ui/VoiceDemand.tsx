import { useTranslation } from "react-i18next";

import { FEATURES, LINKS } from "@/shared/config";
import { cx, Section } from "@/shared/ui";

import { styles } from "./VoiceDemand.styles";

export const ROOT = "VoiceDemand";

/**
 * Спрос на полную озвучку. Ссылки на voice-паки здесь НЕ дублируются: они в
 * блоке Download (иначе два списка из 11 ссылок, см. ревизию 2026-11-20).
 * Здесь только правило подсчёта и каналы: комментарии Steam, endorsements Nexus.
 */
export const VoiceDemand = () => {
  const { t } = useTranslation();

  return (
    <Section id="voice-demand" title={t("Want a full voice-over?")} testId={ROOT}>
      <div className={cx(styles.panel)} data-testid={`${ROOT}--panel`}>
        <p className={cx(styles.lead)} data-testid={`${ROOT}--lead`}>
          {t(
            "Votes are simple: leave a comment under the Steam guide and say which language you want — any wording is fine. Endorsing the mod on Nexus counts too, and so do downloads of the voice pack for your language (summed across all releases). A full voice-over is 69,120 lines, about 10 hours of GPU — the language with the most votes is recorded first.",
          )}
        </p>

        <div className={cx(styles.row)}>
          {FEATURES.nexus ? (
            <a className={cx(styles.btn)} href={LINKS.nexus} data-testid={`${ROOT}--nexus`}>
              {t("Endorse on Nexus Mods")}
            </a>
          ) : (
            <span className={cx(styles.note)} data-testid={`${ROOT}--nexus-pending`}>
              {t("The Nexus page is pending approval — the link will appear here once it is live.")}
            </span>
          )}
          <a className={cx(styles.link)} href={LINKS.steamGuide} data-testid={`${ROOT}--steam`}>
            {t("Comment on the Steam guide — write your language")}
          </a>
          <a className={cx(styles.link)} href="#download" data-testid={`${ROOT}--downloads`}>
            {t("All downloads")}
          </a>
        </div>
      </div>
    </Section>
  );
};
