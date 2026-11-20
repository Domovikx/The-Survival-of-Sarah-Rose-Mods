import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  header: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    // Линия зарезервирована (ширина 1), но невидима, пока страница в начале:
    // иначе под шапкой виден «шов» на пустом месте (2026-11-20).
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    // Фон — РОВНО фон страницы, без полупрозрачности и blur: иначе под
    // шапкой видна полоса другого тона («переход» на стыке, 2026-11-20).
    backgroundColor: "var(--bg)",
  },
  /** Та же колонка 1040 по центру, что у main/футера/панели действий. */
  inner: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "18px 24px 14px",
    maxWidth: 1040,
    width: "100%",
    margin: "0 auto",
    // Ни рамки, ни полупрозрачного фона: всё это живёт на самом header,
    // иначе под шапкой видна вторая полоса («шов», 2026-11-20).
  },
  headerScrolled: { borderBottomColor: "var(--border)" },
  // Логотип — чистый глиф (SVG, без подложки и рамки): в шапке это знак
  // приложения, а не иконка-кнопка (2026-11-20).
  logo: {
    width: 46,
    height: 30,
    flexShrink: 0,
    display: "block",
  },
  titles: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  title: { margin: 0, fontSize: 19, lineHeight: 1.2, letterSpacing: "0.2px" },
  sub: {
    margin: 0,
    color: "var(--muted)",
    fontSize: 12.5,
  },
  /** Подзаголовок-ссылка на Steam: тот же кегль, ссылка узнаётся по hover. */
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
    ":hover": { color: "var(--accent-fg)", textDecoration: "underline" },
    ":focus-visible": { outline: "2px solid var(--accent-fg)", outlineOffset: 2 },
  },
  right: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 },
});
