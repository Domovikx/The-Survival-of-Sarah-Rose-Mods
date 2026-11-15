import { useTranslation } from "react-i18next";

import { LINKS } from "@/shared/config";
import { cx, Section } from "@/shared/ui";

import { styles } from "./Faq.styles";

export const ROOT = "Faq";

export const Faq = () => {
  const { t } = useTranslation();

  return (
    <Section title={t("FAQ")} testId={ROOT}>
      <div className={cx(styles.panel)} data-testid={`${ROOT}--panel`}>
        <div className={cx(styles.qa)} data-testid={`${ROOT}--item-1`}>
          <h3 className={cx(styles.q)} data-testid={`${ROOT}--q-1`}>
            {t("Is this an official mod?")}
          </h3>
          <p className={cx(styles.a)} data-testid={`${ROOT}--a-1`}>
            {t("No — an unofficial fan patch, not affiliated with the developers or publishers.")}
          </p>
        </div>
        <div className={cx(styles.qa)} data-testid={`${ROOT}--item-2`}>
          <h3 className={cx(styles.q)} data-testid={`${ROOT}--q-2`}>
            {t("Is there adult content?")}
          </h3>
          <p className={cx(styles.a)} data-testid={`${ROOT}--a-2`}>
            {t("Yes — the game is 18+. Download and play only if you are 18 or older.")}
          </p>
        </div>
        <div className={cx(styles.qa)} data-testid={`${ROOT}--item-3`}>
          <h3 className={cx(styles.q)} data-testid={`${ROOT}--q-3`}>
            {t("License?")}
          </h3>
          <p className={cx(styles.a)} data-testid={`${ROOT}--a-3`}>
            {t(
              "The voice pack and translation are CC BY-NC 4.0: free to share and adapt with attribution, non-commercial only.",
            )}{" "}
            <a href={LINKS.license} data-testid={`${ROOT}--license-link`}>
              {"CC BY-NC 4.0"}
            </a>
          </p>
        </div>
        <div className={cx(styles.qa)} data-testid={`${ROOT}--item-4`}>
          <h3 className={cx(styles.q)} data-testid={`${ROOT}--q-4`}>
            {t("How to help?")}
          </h3>
          <p className={cx(styles.a)} data-testid={`${ROOT}--a-4`}>
            {t(
              "Endorse the mod on Nexus Mods — it helps other players find it. Bugs and suggestions: the mod page on Nexus.",
            )}{" "}
            <a href={LINKS.nexus} data-testid={`${ROOT}--nexus-link`}>
              {"Nexus Mods"}
            </a>
          </p>
        </div>
      </div>
    </Section>
  );
};
