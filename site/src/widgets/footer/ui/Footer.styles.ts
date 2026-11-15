import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  footer: {
    marginTop: 48,
    borderTop: "1px solid var(--border)",
    padding: "18px 0 32px",
    color: "var(--muted)",
    fontSize: 14,
  },
  links: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    margin: "10px 0 0",
    padding: 0,
    listStyle: "none",
  },
});
