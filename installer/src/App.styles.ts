import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  /** Скроллится САМ ДОКУМЕНТ (не вложенный блок): шапка и панель действий
   *  липкие, поэтому окно feels как обычная страница (замечание 2026-11-20). */
  app: { minHeight: "100%", display: "flex", flexDirection: "column" },
  main: {
    flex: 1,
    padding: "18px 24px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: 1040,
    width: "100%",
    margin: "0 auto",
  },
});
