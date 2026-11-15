import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  panel: {
    backgroundColor: "var(--panel)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 12,
    padding: "16px 18px",
  },
  total: {
    margin: "0 0 8px",
  },
  list: {
    margin: 0,
    paddingLeft: 20,
    color: "var(--muted)",
  },
});
