import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  header: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "18px 24px 14px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
    backgroundColor: "color-mix(in srgb, var(--bg) 88%, transparent)",
    backdropFilter: "blur(8px)",
  },
  logo: { width: 40, height: 40, borderRadius: 10, flexShrink: 0 },
  titles: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  title: { margin: 0, fontSize: 19, lineHeight: 1.2, letterSpacing: "0.2px" },
  sub: { margin: 0, color: "var(--muted)", fontSize: 12.5 },
  right: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 },
  alpha: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.6px",
    textTransform: "uppercase",
    color: "var(--accent-fg)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "color-mix(in srgb, var(--accent) 45%, var(--border))",
    borderRadius: 999,
    padding: "3px 9px",
  },
});
