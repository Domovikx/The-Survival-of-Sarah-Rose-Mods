/**
 * Иконки сайта: один дом для всех SVG (решение владельца 2026-11-15).
 *
 * Зачем отдельный файл: иконки повторялись в виджетах по одной и той же
 * геометрии, но с разными размерами (Steam был 20 в Hero и 16 в шапке) — правка
 * пути требовала помнить про два места. Здесь компонент один, а размер задаёт
 * вызывающий (`<SteamIcon size={16} />`).
 *
 * Правила: `aria-hidden` (иконки декоративные, смысл несёт текст рядом),
 * `fill="currentColor"` — цвет берётся от текста кнопки, размер по умолчанию —
 * самый частый на сайте.
 */

type IconProps = { size?: number };

export const SteamIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 0 0-10 9.6l5.4 2.2a2.8 2.8 0 0 1 1.6-.5h.2l2.4-3.5v-.1a3.8 3.8 0 1 1 3.8 3.8h-.1l-3.4 2.5v.2a2.8 2.8 0 0 1-5.6.2l-3.8-1.6A10 10 0 1 0 12 2zm-3.2 15.2 1.2.5a2.1 2.1 0 1 0 1.2-2.8l1.3.5a1.6 1.6 0 1 1-1.2 2.9l-2.5-1.1zm7.5-5.9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm0-.9a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2z" />
  </svg>
);

export const SunIcon = ({ size = 18 }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
  </svg>
);

export const MoonIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 0 1-4.4 2.26 5.4 5.4 0 0 1-3.16-9.88A9 9 0 0 0 12 3z" />
  </svg>
);

export const PlayIcon = ({ size = 15 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z" />
  </svg>
);

export const PauseIcon = ({ size = 15 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);
