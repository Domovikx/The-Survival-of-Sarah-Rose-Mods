import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: 14,
  },
  card: {
    backgroundColor: "var(--panel)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 12,
    padding: "16px 18px",
  },
  /**
   * Иконка — маркер заголовка, а не кнопка: без плашки, рамки и подложки
   * (в рамке 38×38 она читалась как кликабельная кнопка — замечание владельца
   * 2026-11-20). Один цвет, размер 22, в одной строке с названием.
   */
  titleIcon: {
    display: "inline-flex",
    flex: "0 0 auto",
    color: "var(--accent)",
  },

  cardTitle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 17,
    margin: "0 0 6px",
  },
  cardText: {
    margin: 0,
    color: "var(--muted)",
  },
});
