import type { InstallState } from "@/core/types";
import { t } from "@/i18n";
import { StateIcon } from "@/ui/StateIcon";
import { cx } from "@/ui/cx";

import { LanguageCard } from "./LanguageCard";
import { styles } from "./ComponentsPanel.styles";

export const ROOT = "Components";

type Props = {
  state: InstallState | null;
  langs: readonly string[];
  desired: ReadonlyMap<string, boolean>;
  sizeOf: (lang: string) => string;
  busy: boolean;
  /** Что качается сейчас: код языка (null = ядро) и процент файла. */
  active: { lang: string | null; pct: number } | null;
  onToggle: (lang: string, value: boolean) => void;
};

/** Что ставим: ядро (обязательно) и голосовые паки (тумблеры). */
export const ComponentsPanel = ({ state, langs, desired, sizeOf, busy, active, onToggle }: Props) => {
  const filesOf = new Map((state?.langs ?? []).map((l) => [l.lang, l.files]));

  return (
    <section className={cx(styles.panel)} data-testid={ROOT}>
      <div className={cx(styles.head)}>
        <h2 className={cx(styles.title)}>{t("What to install")}</h2>
        <span className={cx(styles.hint)}>
          {t("main pack is required · voice packs are optional, one per language")}
        </span>
      </div>

      <div className={cx(styles.core, state?.core && styles.coreOn)} data-testid={`${ROOT}--core`}>
        <div className={cx(styles.coreText)}>
          <span className={cx(styles.coreTitle)}>{t("Main pack")}</span>
          <span className={cx(styles.coreSub)}>
            {t("Texts in 10 languages, fonts, mod menu. Required for any voice pack.")}
          </span>
        </div>
        {/* Тот же индикатор, что у голосовых паков: ✓ стоит · + можно
            поставить. Раньше здесь был текстовый бейдж — поведение читалось
            иначе, чем у языков (замечание 2026-11-20). */}
        <div className={cx(styles.coreState)}>
          <StateIcon
            state={state?.core ? "installed" : "add"}
            label={state?.core ? t("installed") : t("not installed")}
            data-testid={`${ROOT}--core-state`}
            data-state={state?.core ? "installed" : "absent"}
          />
        </div>
      </div>

      <div className={cx(styles.grid)} data-testid={`${ROOT}--grid`}>
        {langs.map((lang) => (
          <LanguageCard
            key={lang}
            lang={lang}
            files={filesOf.get(lang)}
            want={desired.get(lang) ?? false}
            size={sizeOf(lang)}
            busy={busy}
            activity={active?.lang === lang ? { pct: active.pct } : null}
            onToggle={(value) => onToggle(lang, value)}
          />
        ))}
      </div>
    </section>
  );
};
