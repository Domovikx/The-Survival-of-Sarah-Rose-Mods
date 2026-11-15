import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  group: {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    padding: 3,
    backgroundColor: "var(--panel-2)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 999,
  },
  item: {
    "appearance": "none",
    "borderWidth": 0,
    "backgroundColor": "transparent",
    "color": "var(--muted)",
    "font": "inherit",
    "fontWeight": 700,
    "fontSize": 12,
    "letterSpacing": "0.04em",
    "borderRadius": 999,
    "padding": "5px 12px",
    "minHeight": 28,
    "cursor": "pointer",
    "transition": "background-color 150ms ease, color 150ms ease, box-shadow 150ms ease",
    ":hover": { color: "var(--text)" },
    ":focus-visible": { outline: "2px solid var(--link)", outlineOffset: 1 },
  },
  itemActive: {
    backgroundColor: "var(--panel)",
    color: "var(--text)",
    boxShadow: "0 1px 4px rgb(0 0 0 / 25%)",
  },
});
