import * as stylex from "@stylexjs/stylex";

/**
 * Стили Hero вынесены из компонента (файл 186 строк: 130 из них — StylesX).
 * Здесь только стили: разметка и текст живут в Hero.tsx, поэтому правки вида
 * «кегль заголовка» не тонут в JSX, а «текст бейджа» — в стилях.
 */
export const styles = stylex.create({
  hero: {
    padding: "44px 20px 8px",
    textAlign: "center",
    maxWidth: 920,
    margin: "0 auto",
  },
  title: {
    fontSize: "clamp(24px, 4.5vw, 36px)",
    lineHeight: 1.25,
    margin: "0 0 12px",
  },
  sub: {
    color: "var(--muted)",
    margin: "0 auto 16px",
    maxWidth: 660,
  },
  badges: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    margin: "14px 0",
  },
  badge: {
    backgroundColor: "var(--panel-2)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 999,
    padding: "5px 12px",
    fontSize: 14,
    color: "var(--muted)",
  },
  badgeAge: {
    backgroundColor: "var(--age-bg)",
    borderColor: "var(--age-border)",
    color: "var(--age-fg)",
    fontWeight: 600,
  },
  cta: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
    margin: "20px 0 8px",
  },
  // Вторичный стиль (ghost) — общий для «Steam» и «Исходники на GitHub»
  steamBtn: {
    "display": "inline-flex",
    "alignItems": "center",
    "gap": 8,
    "padding": "12px 22px",
    "borderRadius": 10,
    "textDecoration": "none",
    "fontWeight": 600,
    "fontSize": 16,
    "color": "var(--text)",
    "backgroundColor": "transparent",
    "borderWidth": 1,
    "borderStyle": "solid",
    "borderColor": "var(--border)",
    "transition": "border-color 150ms ease, background-color 150ms ease, transform 150ms ease",
    ":hover": {
      backgroundColor: "var(--panel-2)",
      borderColor: "var(--link)",
      transform: "translateY(-1px)",
    },
    ":active": { transform: "translateY(0)" },
    ":focus-visible": { outline: "2px solid var(--link)", outlineOffset: 2 },
    "@media (max-width: 480px)": {
      fontSize: 14,
      padding: "10px 14px",
    },
  },
  ghostBtn: {
    "display": "inline-flex",
    "alignItems": "center",
    "padding": "12px 22px",
    "borderRadius": 10,
    "textDecoration": "none",
    "fontWeight": 600,
    "color": "var(--text)",
    "borderWidth": 1,
    "borderStyle": "solid",
    "borderColor": "var(--border)",
    "transition": "border-color 150ms ease, background-color 150ms ease, transform 150ms ease",
    ":hover": {
      backgroundColor: "var(--panel-2)",
      borderColor: "var(--link)",
      transform: "translateY(-1px)",
    },
    ":active": { transform: "translateY(0)" },
    ":focus-visible": { outline: "2px solid var(--link)", outlineOffset: 2 },
  },
  // Единственный акцент в ряду: заливка + glow (стиль перенесён со старого
  // Steam-кнопки, но в фирменном красном — синий остался только у Steam-бренда)
  mainBtn: {
    "display": "inline-flex",
    "alignItems": "center",
    "padding": "12px 22px",
    "borderRadius": 10,
    "textDecoration": "none",
    "fontWeight": 700,
    "fontSize": 16,
    "color": "#fff",
    "backgroundColor": "var(--accent)",
    "borderWidth": 2,
    "borderStyle": "solid",
    "borderColor": "var(--accent)",
    "boxShadow": "0 0 0 1px var(--accent), 0 8px 24px color-mix(in srgb, var(--accent) 35%, transparent)",
    "transition": "box-shadow 150ms ease, transform 150ms ease, background-color 150ms ease",
    ":hover": {
      backgroundColor: "var(--accent-hover)",
      boxShadow: "0 0 0 1px var(--accent-hover), 0 10px 30px color-mix(in srgb, var(--accent) 55%, transparent)",
      transform: "translateY(-1px)",
    },
    ":active": { transform: "translateY(0) scale(0.99)" },
    // Нейтральное кольцо (WCAG 2.4.11 — на заливке нейтраль читается любого цвета)
    ":focus-visible": { outline: "2px solid var(--text)", outlineOffset: 2 },
    "@media (max-width: 480px)": {
      fontSize: 14,
      padding: "10px 14px",
    },
  },
  hint: {
    color: "var(--muted)",
    fontSize: 14,
    margin: "6px 0 0",
  },
});
