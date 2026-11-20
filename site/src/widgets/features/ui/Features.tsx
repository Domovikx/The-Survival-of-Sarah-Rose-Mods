import { useTranslation } from "react-i18next";

import { cx, GlobeIcon, MicIcon, Section, UsersIcon } from "@/shared/ui";

import { styles } from "./Features.styles";

const CARDS = [
  {
    icon: GlobeIcon,
    titleKey: "Translation",
    textKey: "All story text is translated into every supported language.",
    key: "translate",
  },
  {
    icon: MicIcon,
    titleKey: "AI voice acting",
    textKey: "Cloned voices, one per character, with the emotion matched to each scene.",
    key: "voice",
  },
  {
    icon: UsersIcon,
    titleKey: "Living characters",
    textKey: "Sarah, Kate, King Orwell, Thomas, Varga and dozens more.",
    key: "characters",
  },
] as const;

export const ROOT = "Features";

export const Features = () => {
  const { t } = useTranslation();

  return (
    <Section title={t("What you get")} testId="features">
      <div className={cx(styles.grid)} data-testid={`${ROOT}--grid`}>
        {CARDS.map((card) => (
          <div key={card.titleKey} className={cx(styles.card)} data-testid={`${ROOT}--card-${card.key}`}>
            <h3 className={cx(styles.cardTitle)} data-testid={`${ROOT}--card-${card.key}-title`}>
              <span className={cx(styles.titleIcon)} aria-hidden="true">
                <card.icon size={22} />
              </span>
              {t(card.titleKey)}
            </h3>
            <p className={cx(styles.cardText)} data-testid={`${ROOT}--card-${card.key}-text`}>
              {t(card.textKey)}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
};
