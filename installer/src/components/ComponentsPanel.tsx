import type { InstallState } from "@/core/types";
import { t } from "@/i18n";
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
  onToggle: (lang: string, value: boolean) => void;
};

/** Что ставим: ядро (обязательно) и голосовые паки (тумблеры). */
export const ComponentsPanel = ({ state, langs, desired, sizeOf, busy, onToggle }: Props) => {
  const filesOf = new Map((state?.langs ?? []).map((l) => [l.lang, l.files]));

  return (
    <section className={cx(styles.panel)} data-testid={ROOT}>
      <div className={cx(styles.head)}>
        <h2 className={cx(styles.title)}>{t("Components")}</h2>
        <span className={cx(styles.hint)}>{t("optional · one per language · 15–21 MB each")}</span>
      </div>

      <div className={cx(styles.core)} data-testid={`${ROOT}--core`}>
        <div className={cx(styles.coreText)}>
          <span className={cx(styles.coreTitle)}>{t("Core")}</span>
          <span className={cx(styles.coreSub)}>
            {t("Texts in 10 languages, fonts, mod menu. Required for any voice pack.")}
          </span>
        </div>
        <span className={cx(styles.badge, state?.core && styles.badgeOn)} data-testid={`${ROOT}--core-badge`}>
          {state?.core ? t("installed") : t("not installed")}
        </span>
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
            onToggle={(value) => onToggle(lang, value)}
          />
        ))}
      </div>
    </section>
  );
};
