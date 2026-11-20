import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  panel: { flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 },
  head: { display: "flex", alignItems: "baseline", gap: 10 },
  title: { margin: 0, fontSize: 16 },
  hint: { color: "var(--muted)", fontSize: 12.5 },
  // Как и карточки языков: не установлено — сливается с фоном, установлено —
  // плитка. Иначе «не установлено» выглядит заметнее, чем «стоит» (2026-11-20).
  core: {
    // Ровно та же контейнеризация, что у карточки языка: три колонки —
    // иконка 24px · текст · индикатор состояния. Отступы те же, поэтому
    // значки в колонках стоят по одной вертикали (2026-11-20).
    "display": "grid",
    "gridTemplateColumns": "24px 1fr auto",
    "width": "100%",
    "textAlign": "left",
    "font": "inherit",
    "color": "inherit",
    "cursor": "pointer",
    // Кнопка иначе рисуется системной плашкой: по умолчанию — как фон.
    "backgroundColor": "transparent",
    "alignItems": "center",
    "columnGap": 12,
    "padding": "12px 14px",
    "borderRadius": 12,
    "borderWidth": 1,
    "borderStyle": "solid",
    "borderColor": "var(--border)",
    // Наведение — как у карточек языков: один hover-паттерн на всё приложение
    // (замечание 2026-11-20). Курсор не меняем: основной пак обязателен и
    // клик по нему ничего не переключает.
    "transitionProperty": "border-color, background-color",
    "transitionDuration": "140ms",
    ":hover": { borderColor: "var(--accent-fg)" },
    ":focus-visible": { outline: "2px solid var(--accent-fg)", outlineOffset: 2 },
    ":disabled": { cursor: "default" },
  },
  /** Во время установки карточка гаснет, как и языки. */
  coreBusy: { opacity: 0.55, pointerEvents: "none" },
  coreOn: {
    backgroundColor: "var(--panel-2)",
    borderColor: "var(--state-border)",
  },
  /** Первая колонка — иконка пака (у языков здесь флаг). */
  coreIcon: { display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" },
  coreText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  coreTitle: { fontSize: 14.5, fontWeight: 600 },
  coreSub: { fontSize: 12.5, color: "var(--muted)" },
  coreSubPending: { color: "var(--accent-fg)" },
  /** Ячейка индикатора: вторая колонка сетки, как `switch` у языков. */
  coreState: { display: "flex", flexShrink: 0 },
  /**
   * Лента карточек (flex, не grid): у сетки последняя неполная строка всегда
   * прижата влево, а тут она центрируется — 11 языков дают 3+3+3+2.
   * Колонки задаются шириной карточки (см. LanguageCard.styles: card).
   */
  grid: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
});
