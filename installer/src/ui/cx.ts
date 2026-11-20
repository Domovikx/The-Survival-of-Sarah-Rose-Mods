import * as stylex from "@stylexjs/stylex";

/**
 * `className` из стилей StyleX одной функцией (как на лендинге):
 *
 *   className={cx(styles.header)}
 *   className={cx(styles.item, active && styles.on)}
 *
 * StyleX компилирует стили в объекты — класс собирает `props`, он же задаёт
 * порядок наложения, поэтому конкатенация строк не подходит.
 */
type StyleArg = Readonly<Record<string, unknown>> | false | null | undefined;

export const cx = (...styles: ReadonlyArray<StyleArg>): string => {
  const { className } = stylex.props(...(styles as ReadonlyArray<never>));
  return className ?? "";
};
