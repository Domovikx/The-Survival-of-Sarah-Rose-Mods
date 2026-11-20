import * as stylex from "@stylexjs/stylex";

import { cx } from "@/ui/cx";

/**
 * Круговой лоадер: вращается только «голова» (дуга 90°), подложка — бледное
 * кольцо. Цвет — `currentColor`, поэтому лоадер наследует тон места, где стоит
 * (индиго в панели действий, лаванда в карточке языка).
 *
 * Вращение — `stylex.keyframes`: в проекте это единственная анимация, и держать
 * её в CSS-модуле ради одного кольца незачем.
 */
const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

const styles = stylex.create({
  ring: {
    animationName: spin,
    animationDuration: "900ms",
    animationIterationCount: "infinite",
    animationTimingFunction: "linear",
    flexShrink: 0,
    display: "block",
  },
  /** Пользователь просил меньше движения в системе — не крутим. */
  still: {
    "@media (prefers-reduced-motion: reduce)": { animationName: "none" },
  },
});

type Props = { "size"?: number; "data-testid"?: string };

export const Spinner = ({ size = 16, ...rest }: Props) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    aria-hidden="true"
    className={cx(styles.ring, styles.still)}
    {...rest}
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
    <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);
