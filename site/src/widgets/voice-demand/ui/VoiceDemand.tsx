import { useTranslation } from "react-i18next";

import { FEATURES, LANGS, LANG_LABELS, LINKS, type Lang } from "@/shared/config";
import { cx, Section } from "@/shared/ui";

import { styles } from "./VoiceDemand.styles";

/** Тег текущего релиза: кнопки ведут прямо в ассеты (скачивание = «голос» за язык).
 *  Обновляется вместе с релизом, как и RELEASE_BASE в блоке Downloads. */
const RELEASE = "https://github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods/releases/download/v2026.11.19-2237";

const voicePack = (code: string): string => `${RELEASE}/TSSR-AI-Voice-Pack-voice-${code}.7z`;

export const ROOT = "VoiceDemand";

/**
 * Спрос на полную озвучку. Метрика одна и та же на всех площадках: скачивание
 * voice-пака языка + endorsements на Nexus (когда страница откроется).
 * Кнопки ведут прямо в ассеты — это работает уже сейчас, до апрува Nexus.
 */
export const VoiceDemand = () => {
  const { t } = useTranslation();

  return (
    <Section id="voice-demand" title={t("Want a full voice-over?")} testId={ROOT}>
      <div className={cx(styles.panel)} data-testid={`${ROOT}--panel`}>
        <p className={cx(styles.lead)} data-testid={`${ROOT}--lead`}>
          {t(
            "A full voice-over for one language is 69,120 lines — about 10 hours of GPU time. The language with the most demand is recorded first: download the voice pack for your language and endorse the mod on Nexus Mods.",
          )}
        </p>

        <div className={cx(styles.grid)} data-testid={`${ROOT}--langs`}>
          {LANGS.map((code) => (
            <a
              key={code}
              className={cx(styles.lang)}
              href={voicePack(code)}
              data-testid={`${ROOT}--lang-${code}`}
              title={LANG_LABELS[code as Lang]}
            >
              <span className={cx(styles.code)}>{code.toUpperCase()}</span>
              <span className={cx(styles.native)}>{LANG_LABELS[code as Lang]}</span>
            </a>
          ))}
        </div>

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
          <a className={cx(styles.link)} href={`${LINKS.github}/releases`} data-testid={`${ROOT}--all`}>
            {t("All downloads")}
          </a>
        </div>
      </div>
    </Section>
  );
};
