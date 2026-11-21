import * as stylex from "@stylexjs/stylex";

/**
 * Бегущая полоса: когда прогресса в байтах нет (удаление), честнее показать
 * «работа идёт», чем пустой трек. Ширина 34% + сдвиг — визуальный индикатор.
 */
const slide = stylex.keyframes({
  from: { transform: "translateX(-100%)" },
  to: { transform: "translateX(300%)" },
});

export const styles = stylex.create({
  bar: {
    position: "sticky",
    bottom: 0,
    zIndex: 20,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "transparent",
    backgroundColor: "var(--bg)",
  },
  barStuck: { borderTopColor: "var(--border)" },
  inner: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 24px",
    maxWidth: 1040,
    width: "100%",
    margin: "0 auto",
  },
  summary: { display: "flex", alignItems: "center", gap: 8, minWidth: 0, color: "var(--accent-fg)" },
  status: {
    margin: 0,
    fontSize: 13,
    color: "var(--muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  track: {
    width: 240,
    height: 6,
    borderRadius: 999,
    backgroundColor: "var(--panel-2)",
    overflow: "hidden",
    flexShrink: 0,
  },
  /** В покое полоса не видна, но место держит — панель не прыгает. */
  trackIdle: { visibility: "hidden" },
  fill: {
    height: "100%",
    backgroundColor: "var(--accent)",
    // StyleX не понимает shorthand `transition` — только longhands.
    transitionProperty: "width",
    transitionDuration: "180ms",
    transitionTimingFunction: "ease-out",
  },
  fillIndeterminate: {
    "width": "34%",
    "animationName": slide,
    "animationDuration": "1.1s",
    "animationIterationCount": "infinite",
    "animationTimingFunction": "ease-in-out",
    "@media (prefers-reduced-motion: reduce)": { animationDuration: "3s" },
  },
  actions: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 },
  primary: {
    "appearance": "none",
    "display": "inline-flex",
    "alignItems": "center",
    "gap": 8,
    "whiteSpace": "nowrap",
    "cursor": "pointer",
    "padding": "11px 20px",
    "borderRadius": 10,
    "borderWidth": 0,
    "fontSize": 14.5,
    "fontWeight": 700,
    "color": "#fff",
    "backgroundColor": "var(--accent)",
    "transitionProperty": "filter, transform",
    "transitionDuration": "120ms",
    ":hover:not(:disabled)": { filter: "brightness(1.08)" },
    ":active:not(:disabled)": { transform: "translateY(1px)" },
    ":focus-visible": { outline: "2px solid var(--accent-fg)", outlineOffset: 2 },
    // Во время установки кнопка занята: курсор «ждём», но не «нельзя».
    ":disabled": { opacity: 0.75, cursor: "progress" },
  },
  danger: {
    "appearance": "none",
    "cursor": "pointer",
    // «Mod deinstallieren» на узком окне ломалось в две строки и раздувало
    // панель: подпись всегда в одну строку (2026-11-21).
    "whiteSpace": "nowrap",
    "padding": "10px 16px",
    "borderRadius": 10,
    "fontSize": 13.5,
    "fontWeight": 600,
    "color": "var(--text)",
    "backgroundColor": "transparent",
    "borderWidth": 1,
    "borderStyle": "solid",
    "borderColor": "var(--border)",
    ":hover:not(:disabled)": { backgroundColor: "var(--panel-2)", borderColor: "var(--accent-fg)" },
    ":disabled": { opacity: 0.45, cursor: "default" },
    ":focus-visible": { outline: "2px solid var(--accent-fg)", outlineOffset: 2 },
    "@media (max-width: 900px)": { padding: "8px 12px", fontSize: 13 },
  },
});
