import { t } from "@/i18n";
import { CheckIcon, MinusIcon, PlusIcon } from "@/ui/icons";
import { cx } from "@/ui/cx";

import { styles } from "./LanguageCard.styles";

export const ROOT = "Language";

const NAMES: Record<string, string> = {
  en: "English",
  zh: "中文",
  ru: "Русский",
  es: "Español",
  pt: "Português",
  de: "Deutsch",
  ja: "日本語",
  fr: "Français",
  pl: "Polski",
  ko: "한국어",
  it: "Italiano",
};

type Props = {
  lang: string;
  files: number | undefined;
  /** Тумблер: true = язык должен стоять. */
  want: boolean;
  size: string;
  busy: boolean;
  onToggle: (value: boolean) => void;
};

/** Один язык: флаг, название, состояние и тумблер «должен стоять». */
export const LanguageCard = ({ lang, files, want, size, busy, onToggle }: Props) => {
  const installed = files !== undefined;
  const pending = want !== installed;
  // Состояние несёт тумблер и рамка, поэтому в подписи — только ФАКТ:
  // сколько аудиофайлов стоит или сколько весит пак. «установлено · …» — шум.
  const state = pending
    ? want
      ? t("will be installed")
      : t("will be removed")
    : installed
      ? t("{{n}} audio files", { n: (files ?? 0).toLocaleString("en-US") })
      : size;

  // Карточка — это <label>: клик в ЛЮБОМ месте переключает язык (не только
  // по тумблеру) — привычное поведение строки-настройки (замечание 2026-11-20).
  return (
    <label
      data-testid={`${ROOT}--${lang}`}
      className={cx(
        styles.card,
        installed && styles.installed,
        pending && want && styles.pendingAdd,
        busy && styles.busy,
      )}
    >
      <img className={cx(styles.flag)} src={`/flags/${lang}.svg`} alt="" width={22} height={22} />
      <div className={cx(styles.head)}>
        <span className={cx(styles.name)}>{NAMES[lang] ?? lang.toUpperCase()}</span>
        <span className={cx(styles.code)}>{lang.toUpperCase()}</span>
      </div>
      <span
        data-testid={`${ROOT}--${lang}-meta`}
        className={cx(
          styles.meta,
          !pending && installed && styles.metaOk,
          pending && want && styles.metaAdd,
          pending && !want && styles.metaRemove,
        )}
      >
        {state}
      </span>
      {/* Состояние показывает ИКОНКА: ✓ стоит · + можно поставить · − убрать.
          Клик по плашке (label) переключает; чекбокс скрыт, но доступен с клавиатуры. */}
      <span
        className={cx(
          styles.stateIcon,
          installed && !pending && styles.stateOn,
          pending && want && styles.stateAdd,
          pending && !want && styles.stateRemove,
        )}
        data-testid={`${ROOT}--${lang}-toggle`}
        aria-hidden="true"
      >
        {installed && !pending ? <CheckIcon /> : pending && !want ? <MinusIcon /> : <PlusIcon />}
      </span>
      <input
        data-testid={`${ROOT}--${lang}-switch`}
        className={cx(styles.input)}
        type="checkbox"
        role="switch"
        checked={want}
        disabled={busy}
        aria-label={`${NAMES[lang] ?? lang} ${lang.toUpperCase()}`}
        onChange={(e) => onToggle(e.target.checked)}
      />
    </label>
  );
};
