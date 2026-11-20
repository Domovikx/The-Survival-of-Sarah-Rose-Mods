import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  // Без своей верхней границы: разделитель даёт панель действий, иначе между
  // футером и кнопками рисуются две линии подряд (2026-11-20).
  bar: { flexShrink: 0 },
  /** Та же колонка, что у main/шапки: 1040 по центру (не «прилипает» к краю). */
  inner: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    padding: "10px 24px",
    maxWidth: 1040,
    width: "100%",
    margin: "0 auto",
    fontSize: 12.5,
    color: "var(--muted)",
  },
  dot: { color: "var(--border)" },
  link: {
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
