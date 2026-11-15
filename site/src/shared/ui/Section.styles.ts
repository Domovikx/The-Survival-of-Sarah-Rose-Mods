import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  section: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: {
    fontSize: "clamp(20px, 3vw, 26px)",
    margin: "36px 0 12px",
    paddingBottom: 8,
    borderBottom: "1px solid var(--border)",
  },
});
