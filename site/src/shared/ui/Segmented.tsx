import { styles } from "./Segmented.styles";
import { cx } from "./cx";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  testId?: string;
};

type SegmentedProps<T extends string> = {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  /** data-testid группы (контейнера пилюли) */
  testId?: string;
};

/**
 * Segmented pill — стандартный селектор выбора из 2-3 опций (например, язык):
 * оба варианта видны одновременно, активный — подсвечен «пилюлей» (как у GitHub).
 */
export const Segmented = <T extends string>({ value, options, onChange, ariaLabel, testId }: SegmentedProps<T>) => (
  <div className={cx(styles.group)} role="group" aria-label={ariaLabel} data-testid={testId}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        className={cx(styles.item, option.value === value && styles.itemActive)}
        aria-pressed={option.value === value}
        data-testid={option.testId}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);
