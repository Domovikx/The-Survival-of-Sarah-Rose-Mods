import { useTranslation } from "react-i18next";

import { VOICE_PROGRESS } from "@/shared/config";
import { cx, Section } from "@/shared/ui";

import { styles } from "./VoiceProgress.styles";

export const ROOT = "VoiceProgress";

/**
 * Публичный прогресс ПОЛНОЙ озвучки (первый язык — английский): сколько строк
 * уже записано из плана, измеренная скорость и сколько осталось. Цифры —
 * снимок из `scripts/voice_progress.mts` (`VOICE_PROGRESS`), поэтому страница
 * честно показывает дату снимка: живой счётчик на статичном сайте был бы
 * обманом. Правило голосования — в блоке VoiceDemand ниже.
 */
export const VoiceProgress = () => {
  const { t, i18n } = useTranslation();
  const { en, updatedAt } = VOICE_PROGRESS;

  const lang = i18n.language;
  const int = new Intl.NumberFormat(lang);
  const dec = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 1 });
  const when = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(new Date(updatedAt));

  const share = en.plan > 0 ? en.done / en.plan : 0;
  const hours = en.etaMin === null ? null : Math.round(en.etaMin / 60);
  const days = en.etaMin === null ? null : Math.max(1, Math.round(en.etaMin / 1440));

  return (
    <Section id="voice-progress" title={t("Full English voice-over: progress")} testId={ROOT}>
      <div className={cx(styles.panel)} data-testid={`${ROOT}--panel`}>
        <div className={cx(styles.head)}>
          <span className={cx(styles.pct)} data-testid={`${ROOT}--pct`}>
            {percent.format(share)}
          </span>
          <span className={cx(styles.caption)} data-testid={`${ROOT}--lines`}>
            {t("{{done}} of {{total}} lines recorded", { done: int.format(en.done), total: int.format(en.plan) })}
          </span>
        </div>

        <div
          className={cx(styles.track)}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(share * 100)}
          data-testid={`${ROOT}--bar`}
        >
          <div className={cx(styles.fill)} style={{ width: `${Math.max(0.5, share * 100)}%` }} />
        </div>

        <div className={cx(styles.row)}>
          {en.ratePerMin === null ? null : (
            <span className={cx(styles.fact)} data-testid={`${ROOT}--rate`}>
              {t("Measured speed: {{rate}} lines per minute.", { rate: dec.format(en.ratePerMin) })}
            </span>
          )}
          {hours === null || days === null ? null : (
            <span className={cx(styles.fact)} data-testid={`${ROOT}--eta`}>
              {hours < 48
                ? t("At the measured speed the remaining lines take about {{hours}} hours of continuous GPU time.", {
                    hours: int.format(hours),
                  })
                : t("At the measured speed the remaining lines take about {{days}} days of continuous GPU time.", {
                    days: int.format(days),
                  })}
            </span>
          )}
        </div>

        <p className={cx(styles.note)} data-testid={`${ROOT}--snapshot`}>
          {t(
            "Snapshot from {{date}}. Recording runs continuously, so by the time you read this the counters are already higher.",
            { date: when },
          )}
        </p>
        <p className={cx(styles.note)} data-testid={`${ROOT}--demo`}>
          {t(
            "Demo packs cover 1,171–1,399 lines per language. English is recorded first; other languages go in order of votes below.",
          )}
        </p>
      </div>
    </Section>
  );
};
