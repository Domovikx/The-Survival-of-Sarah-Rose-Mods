import * as stylex from '@stylexjs/stylex'

const styles = stylex.create({
  group: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    padding: 3,
    backgroundColor: 'var(--panel-2)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 999,
  },
  item: {
    appearance: 'none',
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: 'var(--muted)',
    font: 'inherit',
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: '0.04em',
    borderRadius: 999,
    padding: '5px 12px',
    minHeight: 28,
    cursor: 'pointer',
    transition: 'background-color 150ms ease, color 150ms ease, box-shadow 150ms ease',
    ':hover': { color: 'var(--text)' },
    ':focus-visible': { outline: '2px solid var(--link)', outlineOffset: 1 },
  },
  itemActive: {
    backgroundColor: 'var(--panel)',
    color: 'var(--text)',
    boxShadow: '0 1px 4px rgb(0 0 0 / 25%)',
  },
})

export type SegmentedOption<T extends string> = {
  value: T
  label: string
  testId?: string
}

type SegmentedProps<T extends string> = {
  value: T
  options: ReadonlyArray<SegmentedOption<T>>
  onChange: (value: T) => void
  ariaLabel: string
  /** data-testid группы (контейнера пилюли) */
  testId?: string
}

/**
 * Segmented pill — стандартный селектор выбора из 2-3 опций (например, язык):
 * оба варианта видны одновременно, активный — подсвечен «пилюлей» (как у GitHub).
 */
export const Segmented = <T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  testId,
}: SegmentedProps<T>) => (
  <div
    className={stylex.props(styles.group).className}
    role="group"
    aria-label={ariaLabel}
    data-testid={testId}
  >
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        className={stylex.props(styles.item, option.value === value && styles.itemActive).className}
        aria-pressed={option.value === value}
        data-testid={option.testId}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
)
