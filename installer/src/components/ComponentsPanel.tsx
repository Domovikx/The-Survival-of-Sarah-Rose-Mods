import type { InstallState } from "@/core/types";
import { t } from "@/i18n";
import { PackageIcon } from "@/ui/icons";
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
  /** Клик по основному паку: стоит → снести всё, не стоит → поставить. */
  onCoreClick: () => void;
  /** Помечено «снять всё»: основной пак и языки уйдут вместе. */
  removeAll: boolean;
};

/** Что ставим: ядро (обязательно) и голосовые паки (тумблеры). */
export const ComponentsPanel = ({
  state,
  langs,
  desired,
  sizeOf,
  busy,
  active,
  removeAll,
  onToggle,
  onCoreClick,
}: Props) => {
  const filesOf = new Map((state?.langs ?? []).map((l) => [l.lang, l.files]));

  return (
    <section className={cx(styles.panel)} data-testid={ROOT}>
      <div className={cx(styles.head)}>
        <h2 className={cx(styles.title)}>{t("What to install")}</h2>
        <span className={cx(styles.hint)}>
          {t("main pack is required · voice packs are optional, one per language")}
        </span>
      </div>

      {/* Основной пак — такая же кликабельная карточка, как языки. Он
          обязателен, поэтому «снять» его можно только целиком: клик по
          установленному паку удаляет мод (с подтверждением), по снятому —
          ставит его (замечание владельца 2026-11-20). */}
      <button
        type="button"
        className={cx(styles.core, state?.core && styles.coreOn, busy && styles.coreBusy)}
        data-testid={`${ROOT}--core`}
        data-state={removeAll ? "remove" : state?.core ? "installed" : "absent"}
        aria-label={removeAll ? t("cancel removal of the main pack") : t("Main pack")}
        disabled={busy}
        onClick={onCoreClick}
      >
        <span className={cx(styles.coreIcon)} aria-hidden="true">
          <PackageIcon />
        </span>
        <div className={cx(styles.coreText)}>
          <span className={cx(styles.coreTitle)}>{t("Main pack")}</span>
          <span className={cx(styles.coreSub, removeAll && styles.coreSubPending)}>
            {removeAll
              ? t("will be removed")
              : t("Texts in 10 languages, fonts, mod menu. Required for any voice pack.")}
          </span>
        </div>
        {/* Тот же индикатор, что у голосовых паков: ✓ стоит · + можно
            поставить. Раньше здесь был текстовый бейдж — поведение читалось
            иначе, чем у языков (замечание 2026-11-20). */}
        <div className={cx(styles.coreState)}>
          <StateIcon
            state={removeAll ? "remove" : state?.core ? "installed" : "add"}
            label={removeAll ? t("will be removed") : state?.core ? t("installed") : t("not installed")}
            data-testid={`${ROOT}--core-state`}
            data-state={removeAll ? "remove" : state?.core ? "installed" : "absent"}
          />
        </div>
      </button>

      <div className={cx(styles.grid)} data-testid={`${ROOT}--grid`}>
        {langs.map((lang) => (
          <LanguageCard
            key={lang}
            lang={lang}
            files={filesOf.get(lang)}
            want={desired.get(lang) ?? false}
            size={sizeOf(lang)}
            busy={busy}
            locked={removeAll}
            activity={active?.lang === lang ? { pct: active.pct } : null}
            onToggle={(value) => onToggle(lang, value)}
          />
        ))}
      </div>
    </section>
  );
};
