import { useTranslation } from "react-i18next";

import { LINKS } from "@/shared/config";
import { cx, Section } from "@/shared/ui";

import { styles } from "./VoiceDemand.styles";

export const ROOT = "VoiceDemand";

/**
 * Спрос на полную озвучку. Ссылки на voice-паки здесь НЕ дублируются: они в
 * блоке Download (иначе два списка из 11 ссылок, см. ревизию 2026-11-20).
 * Каналы — комментарии Steam и скачивания паков; Nexus с лендинга убран до
 * апрува мода (решение владельца 2026-11-20): пользователей ведём на лендинг
 * и наши патчи, чтобы не отправлять их на страницу-404.
 */
export const VoiceDemand = () => {
  const { t } = useTranslation();

  return (
    <Section id="voice-demand" title={t("Want a full voice-over?")} testId={ROOT}>
      <div className={cx(styles.panel)} data-testid={`${ROOT}--panel`}>
        <p className={cx(styles.lead)} data-testid={`${ROOT}--lead`}>
          {t(
            "Votes are simple: leave a comment under the Steam guide and say which language you want — any wording is fine. Downloads of the voice pack for your language also count, summed across all releases. The language with the most votes is recorded first.",
          )}
        </p>

        <div className={cx(styles.row)}>
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
