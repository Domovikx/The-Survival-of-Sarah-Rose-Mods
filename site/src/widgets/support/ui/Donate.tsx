import { useTranslation } from "react-i18next";

import { cx, Section } from "@/shared/ui";

import { styles } from "./Support.styles";

const BOOSTY = "https://boosty.to/domovikx";
const KOFI = "https://ko-fi.com/domovikx";

/**
 * Донат — отдельный блок ПОСЛЕ скачивания (решение 2026-11-15 по данным
 * исследований конверсии): бесплатные действия (endorse, оценка гайда) стоят
 * сразу после демо, а просьба о деньгах — там, где файл уже получен. Порядок
 * «сначала бесплатно, потом деньги» даёт лучший отклик, чем один смешанный блок.
 *
 * Стили общие с Support — это один слайс (`widgets/support`), поэтому
 * `Support.styles.ts` здесь не дублируется.
 */
export const Donate = () => {
  const { t } = useTranslation();

  return (
    <Section id="donate" title={t("Donation")} testId="donate">
      <div className={cx(styles.panel)} data-testid="donate-panel">
        <p className={cx(styles.lead)}>
          {t("A donation on Boosty or Ko-fi — it pays for the AI and the hours behind the voice")}
        </p>

        <div className={cx(styles.row)}>
          <a className={cx(styles.btn)} href={BOOSTY} data-testid="donate-boosty" rel="noopener">
            {"Boosty"}
          </a>
          <a className={cx(styles.btn)} href={KOFI} data-testid="donate-kofi" rel="noopener">
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
