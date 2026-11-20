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
    // Линия зарезервирована (ширина 1), но невидима, пока страница в начале:
    // иначе под шапкой виден «шов» на пустом месте (2026-11-20).
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    backgroundColor: "color-mix(in srgb, var(--bg) 88%, transparent)",
  },
  // Иконка сама по себе — тёмная плашка на тёмной шапке: без кольца она
  // «растворяется». 42px + 1px рамка дают чёткий край в обеих темах.
  headerScrolled: { borderBottomColor: "var(--border)" },
  // Логотип — чистый глиф (SVG, без подложки и рамки): в шапке это знак
  // приложения, а не иконка-кнопка (2026-11-20).
  logo: {
    width: 42,
    height: 30,
    objectFit: "contain",
    flexShrink: 0,
    display: "block",
  },
  titles: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  title: { margin: 0, fontSize: 19, lineHeight: 1.2, letterSpacing: "0.2px" },
  sub: { margin: 0, color: "var(--muted)", fontSize: 12.5 },
  right: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 },
});
