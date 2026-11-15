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
  qa: {
    margin: "10px 0",
  },
  q: {
    margin: "0 0 4px",
    fontSize: 16,
  },
  a: {
    margin: 0,
    color: "var(--muted)",
  },
});
