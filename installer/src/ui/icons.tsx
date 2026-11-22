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

/** Внешняя ссылка: стрелка «наружу» (открывается браузер). */
export const ExternalIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M8 16 16 8M9 8h7v7" />
  </svg>
);

/** Основной пак: коробка (первая колонка карточки, как флаг у языков). */
export const PackageIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8z" />
    <path d="m3 8 9 5 9-5M12 13v8" />
  </svg>
);

/** Не найдено: предупреждение (нейтральный тон — в палитре нет красного). */
export const AlertIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M10.3 4.3 3.4 16a2 2 0 0 0 1.7 3h13.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 16.5v.5" />
  </svg>
);

/** Запустить игру: треугольник «play» (финальное состояние установщика). */
export const PlayIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);
