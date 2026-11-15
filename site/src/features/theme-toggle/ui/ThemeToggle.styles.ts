import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  toggle: {
    "appearance": "none",
    "borderWidth": 1,
    "borderStyle": "solid",
    "borderColor": "var(--border)",
    "backgroundColor": "var(--panel-2)",
    "color": "var(--text)",
    "borderRadius": "50%",
    "width": 36,
    "height": 36,
    "display": "inline-flex",
    "alignItems": "center",
    "justifyContent": "center",
    "cursor": "pointer",
    "position": "relative",
    "transition": "border-color 150ms ease, background-color 150ms ease, transform 150ms ease",
    ":hover": {
      borderColor: "var(--link)",
      backgroundColor: "var(--panel)",
    },
    ":active": { transform: "scale(0.95)" },
    ":focus-visible": { outline: "2px solid var(--link)", outlineOffset: 2 },
  },
  iconBox: {
    position: "relative",
    width: 18,
    height: 18,
  },
  icon: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "transform 250ms ease, opacity 250ms ease",
  },
  iconHidden: {
    transform: "rotate(90deg) scale(0.4)",
    opacity: 0,
  },
  reducedMotion: {
    "@media (prefers-reduced-motion: reduce)": {
      transition: "none",
    },
  },
});
