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
  cardTitle: {
    fontSize: 17,
    margin: "0 0 6px",
  },
  cardText: {
    margin: 0,
    color: "var(--muted)",
  },
});
