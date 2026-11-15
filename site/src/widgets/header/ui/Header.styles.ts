import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  header: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    backdropFilter: "blur(8px)",
    backgroundColor: "color-mix(in srgb, var(--bg) 82%, transparent)",
    borderBottom: "1px solid var(--border)",
  },
  inner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    paddingTop: 10,
    paddingBottom: 10,
  },
  brand: {
    fontWeight: 700,
    textDecoration: "none",
    color: "var(--text)",
    marginRight: "auto",
  },
  // Вторичный стиль (ghost) — тот же, что у GitHub-ссылки
  steamLink: {
    "textDecoration": "none",
    "fontWeight": 600,
    "fontSize": 14,
    "color": "var(--link)",
    "borderWidth": 1,
    "borderStyle": "solid",
    "borderColor": "var(--border)",
    "borderRadius": 8,
    "padding": "6px 12px",
    "display": "inline-flex",
    "alignItems": "center",
    "gap": 6,
    "transition": "border-color 150ms ease, background-color 150ms ease",
    ":hover": {
      backgroundColor: "var(--panel-2)",
      borderColor: "var(--link)",
    },
    ":focus-visible": { outline: "2px solid var(--link)", outlineOffset: 2 },
  },
  ghostLink: {
    "textDecoration": "none",
    "fontWeight": 600,
    "fontSize": 14,
    "color": "var(--link)",
    "borderWidth": 1,
    "borderStyle": "solid",
    "borderColor": "var(--border)",
    "borderRadius": 8,
    "padding": "6px 12px",
    "transition": "border-color 150ms ease, background-color 150ms ease",
    ":hover": {
      backgroundColor: "var(--panel-2)",
      borderColor: "var(--link)",
    },
    ":focus-visible": { outline: "2px solid var(--link)", outlineOffset: 2 },
  },
});
