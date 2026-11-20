/**
 * Знак приложения — эквалайзер (выбор владельца 2026-11-20).
 *
 * Пять полос: центральная — цвет акцента, остальные — светлый лавандовый.
 * Цвета берутся из токенов (`--accent` / `--accent-fg`), поэтому знак одинаково
 * читается в тёмной и светлой теме без отдельных файлов.
 *
 * Форма специально простая: в шапке знак живёт в 46×30, а на 16 px иконки
 * exe любая мелкая деталь (микрофон, корона, спираль) превращается в кашу.
 */
type Props = {
  "className"?: string;
  "data-testid"?: string;
};

const PRIMARY = "var(--accent)";
const SECONDARY = "var(--accent-fg)";

export const LogoMark = ({ ...rest }: Props) => (
  <svg viewBox="0 0 58 40" aria-hidden="true" fill="none" {...rest}>
    <g fill={SECONDARY}>
      <rect x="6" y="14" width="6" height="12" rx="3" />
      <rect x="16" y="8" width="6" height="24" rx="3" />
      <rect x="26" y="2" width="6" height="36" rx="3" fill={PRIMARY} />
      <rect x="36" y="8" width="6" height="24" rx="3" />
      <rect x="46" y="14" width="6" height="12" rx="3" />
    </g>
  </svg>
);
