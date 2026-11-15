import { useTranslation } from "react-i18next";

import { cx, Section } from "@/shared/ui";

import { styles } from "./VoiceStatus.styles";

export const ROOT = "VoiceStatus";

export const VoiceStatus = () => {
  const { t } = useTranslation();

  return (
    <Section title={t("Voice acting — demo ready")} testId={ROOT}>
      <div className={cx(styles.panel)} data-testid={`${ROOT}--voice-panel`}>
        <ul className={cx(styles.list)} data-testid={`${ROOT}--voice-list`}>
          <li data-testid={`${ROOT}--voice-ru`}>{t("Russian (RU): complete translation, demo scope voiced")}</li>
          <li data-testid={`${ROOT}--voice-en`}>{t("English (EN): the original text, demo scope voiced")}</li>
          <li data-testid={`${ROOT}--voice-missing`}>
            {t("If a line has no voice file yet — the game just plays it silently (no errors, no crashes).")}
          </li>
        </ul>
      </div>
    </Section>
  );
};
