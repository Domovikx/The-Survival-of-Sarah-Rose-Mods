import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  card: {
    flexShrink: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 14,
    backgroundColor: "var(--panel)",
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  head: { display: "flex", alignItems: "center", gap: 10 },
  title: { margin: 0, fontSize: 14, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.2px" },
  // Шапка: заголовок · «Найти заново» · индикатор. Высота шапки задаётся
  // индикатором (28px) — строки ниже выровнены по одной сетке, поэтому
  // «грибы» (разъезд по вертикали) не появляются.
  row: { display: "grid", gridTemplateColumns: "108px 1fr", gap: 12, alignItems: "center" },
  key: { color: "var(--muted)", fontSize: 13 },
  value: { margin: 0, fontSize: 14, wordBreak: "break-all", fontVariantNumeric: "tabular-nums" },
  /** Кнопка поиска — справа в шапке карточки: путь и сборка читаются слева. */
  detect: { marginLeft: "auto" },
  ghost: {
    "appearance": "none",
    "cursor": "pointer",
    "padding": "7px 14px",
    "borderRadius": 10,
    "borderWidth": 1,
    "borderStyle": "solid",
    "borderColor": "var(--border)",
    "backgroundColor": "transparent",
    "color": "var(--text)",
    "fontSize": 13,
    "fontWeight": 500,
    ":hover": { backgroundColor: "var(--panel-2)", borderColor: "var(--accent-fg)" },
    ":focus-visible": { outline: "2px solid var(--accent-fg)", outlineOffset: 2 },
  },
});
