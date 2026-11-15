import * as stylex from "@stylexjs/stylex";

/**
 * `className` из стилей StylesX одной короткой функцией:
 *
 *   className={cx(styles.header)}                    // было: stylex.props(styles.header).className
 *   className={cx(styles.item, active && styles.on)} // несколько стилей — тоже
 *
 * Почему так: `stylex.props(...)` возвращает `{ className, style }`, и `.className`
 * приходилось дописывать руками 124 раза. Сам `styles.header` строкой быть не
 * может — StylesX компилирует стили в объекты (класс собирает `props`, он же
 * задаёт порядок наложения стилей, поэтому конкатенация строк не годится).
 *
 * Принимаем любой стилевой объект StylesX (включая медиа-ключи и `false` от
 * `cond && styles.x`); проверку имён делает сам объект `styles` из *.styles.ts.
 * Живёт в shared/ui, а не в каждом виджете: одно место на весь сайт.
 */
type StyleArg = Readonly<Record<string, unknown>> | false | null | undefined;

export const cx = (...styles: ReadonlyArray<StyleArg>): string => {
  const { className } = stylex.props(...(styles as ReadonlyArray<never>));
  return className ?? "";
};
