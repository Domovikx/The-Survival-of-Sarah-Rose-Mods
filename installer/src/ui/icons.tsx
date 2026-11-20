/**
 * Иконки инсталлятора — один дом на все SVG (как на лендинге): размер задаёт
 * вызывающий, цвет — `currentColor`, иконки декоративные (`aria-hidden`).
 */
type IconProps = { size?: number };

const base = (size: number) => ({
  "width": size,
  "height": size,
  "viewBox": "0 0 24 24",
  "fill": "none",
  "stroke": "currentColor",
  "strokeWidth": 2,
  "strokeLinecap": "round" as const,
  "strokeLinejoin": "round" as const,
  "aria-hidden": true,
});

/** Установлено: галочка. */
export const CheckIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/** Не установлено: плюс (можно добавить). */
export const PlusIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** Будет удалено: минус. */
export const MinusIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M5 12h14" />
  </svg>
);
