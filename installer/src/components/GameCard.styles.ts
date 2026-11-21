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
    gap: 8,
  },
  // Таблица «ключ · значение · действие»: шапка и все строки по одной сетке,
  // поэтому «Найти заново» стоит ровно над путём, а индикатор — справа.
  head: { display: "grid", gridTemplateColumns: "108px 1fr auto", alignItems: "center", gap: 12 },
  title: { margin: 0, fontSize: 13.5, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.2px" },
  // Шапка: заголовок · «Найти заново» · индикатор. Высота шапки задаётся
  // индикатором (28px) — строки ниже выровнены по одной сетке, поэтому
  // «грибы» (разъезд по вертикали) не появляются.
  row: { display: "grid", gridTemplateColumns: "108px 1fr auto", gap: 12, alignItems: "center" },
  key: { color: "var(--muted)", fontSize: 13 },
  value: { margin: 0, fontSize: 14, fontVariantNumeric: "tabular-nums" },
  /** Путь длиннее карточки: одна строка с эллипсисом, полный — в title. */
  path: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 },
  /** Кнопка поиска — в строке «Папка», справа. */
  detect: { justifySelf: "end" },
  /** Ссылка на игру в Steam: тот же кегль, узнаётся по подчёркиванию. */
  subLink: {
    "appearance": "none",
    "cursor": "pointer",
    "display": "inline-flex",
    "alignItems": "center",
    "gap": 5,
    "padding": 0,
    "borderWidth": 0,
    "backgroundColor": "transparent",
    "textAlign": "left",
    "fontFamily": "inherit",
    "fontSize": 12.5,
    "color": "var(--link)",
    ":hover": { color: "var(--accent-fg)", textDecoration: "underline" },
    ":focus-visible": { outline: "2px solid var(--accent-fg)", outlineOffset: 2 },
  },
  ghost: {
    "appearance": "none",
    "cursor": "pointer",
    "padding": "5px 11px",
    "borderRadius": 9,
    "borderWidth": 1,
    "borderStyle": "solid",
    "borderColor": "var(--border)",
    "backgroundColor": "transparent",
    "color": "var(--text)",
    "fontSize": 12.5,
    "fontWeight": 500,
    ":hover": { backgroundColor: "var(--panel-2)", borderColor: "var(--accent-fg)" },
    ":focus-visible": { outline: "2px solid var(--accent-fg)", outlineOffset: 2 },
  },
});
