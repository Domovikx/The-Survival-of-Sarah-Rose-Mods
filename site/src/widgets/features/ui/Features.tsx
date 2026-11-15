import { useTranslation } from "react-i18next";

import { cx, Section } from "@/shared/ui";

import { styles } from "./Features.styles";

const CARDS = [
  {
    icon: "🌐",
    titleKey: "Translation",
    textKey: "Russian — the whole story. Other languages — the opening (demo scope).",
    testId: "features-card-translate",
  },
  {
    icon: "🎙",
    titleKey: "AI voice acting",
    textKey: "Cloned voices, one per character, with the emotion matched to each scene.",
    testId: "features-card-voice",
  },
  {
    icon: "🗣",
    titleKey: "Living characters",
    textKey: "Sarah, Kate, King Orwell, Thomas, Varga and dozens more.",
    testId: "features-card-voices",
  },
] as const;

export const Features = () => {
  const { t } = useTranslation();

  return (
    <Section title={t("What you get")} testId="features">
      <div className={cx(styles.grid)} data-testid="features-grid">
        {CARDS.map((card) => (
          <div key={card.titleKey} className={cx(styles.card)} data-testid={card.testId}>
            <h3 className={cx(styles.cardTitle)} data-testid={`${card.testId}-title`}>
              {card.icon} {t(card.titleKey)}
            </h3>
            <p className={cx(styles.cardText)} data-testid={`${card.testId}-text`}>
              {t(card.textKey)}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
};
