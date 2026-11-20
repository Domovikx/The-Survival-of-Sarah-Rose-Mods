import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  app: { height: "100%", display: "grid", gridTemplateRows: "auto 1fr auto auto" },
  main: {
    overflow: "auto",
    padding: "18px 24px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: 1040,
    width: "100%",
    margin: "0 auto",
  },
  /** Футер — отдельная полоса между прокруткой и панелью действий:
   *  он не «уезжает» под кнопки и не обрезается при раскрытом журнале. */
  footer: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 24px",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--border)",
    fontSize: 12.5,
    color: "var(--muted)",
  },
  dot: { color: "var(--border)" },
  link: {
    "appearance": "none",
    "backgroundColor": "transparent",
    "borderWidth": 0,
    "padding": 0,
    "fontSize": 12.5,
    "color": "var(--accent-fg)",
    "cursor": "pointer",
    ":hover": { textDecoration: "underline" },
    ":focus-visible": { outline: "2px solid var(--accent-fg)", outlineOffset: 3, borderRadius: 4 },
  },
  pushRight: { marginLeft: "auto" },
});
