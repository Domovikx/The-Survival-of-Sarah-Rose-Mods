import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  /** Панель — как в остальных секциях лендинга (VoiceDemand/Install): один блок. */
  panel: {
    backgroundColor: "var(--panel)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 12,
    padding: "16px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },

  lead: { margin: 0, color: "var(--muted)" },

  /** Два пути внутри одной панели; на узком экране — в столбик. */
  options: {
    "display": "grid",
    "gridTemplateColumns": "1fr 1fr",
    "columnGap": 30,
    "alignItems": "start",
    "@media (max-width: 780px)": { gridTemplateColumns: "1fr", columnGap: 0 },
  },

  /** Правая колонка отделена вертикальной линией (на мобильном — горизонтальной). */
  optionManual: {
    "paddingLeft": 30,
    "borderLeftWidth": 1,
    "borderLeftStyle": "solid",
    "borderLeftColor": "var(--border)",
    "@media (max-width: 780px)": {
      paddingLeft: 0,
      borderLeftWidth: 0,
      paddingTop: 18,
      borderTopWidth: 1,
      borderTopStyle: "solid",
      borderTopColor: "var(--border)",
    },
  },

  option: { display: "flex", flexDirection: "column", gap: 10 },

  /** Метка пути: акцентная (главный) или тихая (ручной). */
  tag: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.4px",
    textTransform: "uppercase",
    color: "var(--accent)",
  },

  tagMuted: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.4px",
    textTransform: "uppercase",
    color: "var(--muted)",
  },

  optionTitle: { margin: 0, fontSize: 17, lineHeight: 1.3 },
  optionText: { margin: 0, color: "var(--muted)", fontSize: 14 },

  /** Главная кнопка: тот же акцент, что и CTA в других секциях. */
  primaryBtn: {
    "display": "inline-flex",
    "alignItems": "center",
    "alignSelf": "flex-start",
    "padding": "11px 18px",
    "borderRadius": 10,
    "textDecoration": "none",
    "fontWeight": 700,
    "fontSize": 15,
    "color": "#fff",
    "backgroundColor": "var(--accent)",
    "transition": "transform 120ms ease, filter 120ms ease",
    ":hover": { filter: "brightness(1.08)" },
    ":active": { transform: "translateY(1px)" },
    ":focus-visible": { outline: "2px solid var(--link)", outlineOffset: 2 },
  },

  /** Второй путь: та же форма, но без акцента — кнопка не спорит с главной. */
  secondaryBtn: {
    "display": "inline-flex",
    "alignItems": "center",
    "alignSelf": "flex-start",
    "padding": "10px 16px",
    "borderRadius": 10,
    "textDecoration": "none",
    "fontWeight": 600,
    "fontSize": 14,
    "color": "var(--text)",
    "backgroundColor": "transparent",
    "borderWidth": 1,
    "borderStyle": "solid",
    "borderColor": "var(--border)",
    "transition": "border-color 150ms ease, color 150ms ease",
    ":hover": { borderColor: "var(--link)", color: "var(--link)" },
    ":focus-visible": { outline: "2px solid var(--link)", outlineOffset: 2 },
  },

  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px" },

  /** Общий ряд под колонками: чипсы языков + инструкция (одна на оба пути). */
  shared: { display: "flex", flexDirection: "column", gap: 10 },
  chips: { display: "flex", flexWrap: "wrap", gap: 8 },
  chipsLabel: { margin: "2px 0 0", color: "var(--muted)", fontSize: 14 },

  chip: {
    "display": "inline-flex",
    "flexDirection": "column",
    "alignItems": "flex-start",
    "lineHeight": 1.25,
    "padding": "5px 11px",
    "borderRadius": 10,
    "textDecoration": "none",
    "fontSize": 13,
    "fontWeight": 600,
    "color": "var(--text)",
    "backgroundColor": "var(--panel-2)",
    "borderWidth": 1,
    "borderStyle": "solid",
    "borderColor": "var(--border)",
    "transition": "border-color 150ms ease, color 150ms ease",
    ":hover": { borderColor: "var(--link)", color: "var(--link)" },
    ":focus-visible": { outline: "2px solid var(--link)", outlineOffset: 2 },
  },

  chipCode: { fontSize: 13, fontWeight: 700 },
  chipSize: { fontSize: 11, fontWeight: 500, color: "var(--muted)", fontVariantNumeric: "tabular-nums" },

  meta: { margin: 0, color: "var(--muted)", fontSize: 13 },

  /** Блокировка после нажатия: видно, что клик принят, и повторный клик не идёт. */
  linkBusy: { opacity: 0.55, pointerEvents: "none", cursor: "progress" },

  /** Строка статуса: место зарезервировано, чтобы вёрстка не прыгала. */
  status: { margin: 0, minHeight: 18, color: "var(--muted)", fontSize: 13 },

  note: { margin: 0, color: "var(--muted)", fontSize: 12, fontStyle: "italic" },
});
