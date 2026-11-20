import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  panel: { flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 },
  head: { display: "flex", alignItems: "baseline", gap: 10 },
  title: { margin: 0, fontSize: 16 },
  hint: { color: "var(--muted)", fontSize: 12.5 },
  // Как и карточки языков: не установлено — сливается с фоном, установлено —
  // плитка. Иначе «не установлено» выглядит заметнее, чем «стоит» (2026-11-20).
  core: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
  },
  coreOn: {
    backgroundColor: "var(--panel-2)",
    borderColor: "var(--state-border)",
  },
  coreText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  coreTitle: { fontSize: 14.5, fontWeight: 600 },
  coreSub: { fontSize: 12.5, color: "var(--muted)" },
  badge: {
    marginLeft: "auto",
    flexShrink: 0,
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: "0.4px",
    textTransform: "uppercase",
    padding: "4px 10px",
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    color: "var(--muted)",
  },
  badgeOn: {
    color: "var(--accent-fg)",
    backgroundColor: "var(--state-bg)",
    borderColor: "var(--state-border)",
  },
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
