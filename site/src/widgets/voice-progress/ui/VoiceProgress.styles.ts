import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  panel: {
    backgroundColor: "var(--panel)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 12,
    padding: "18px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  head: { display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" },
  pct: {
    fontSize: 40,
    lineHeight: 1,
    fontWeight: 700,
    color: "var(--text)",
    fontVariantNumeric: "tabular-nums",
  },
  caption: { color: "var(--muted)", fontVariantNumeric: "tabular-nums" },
  track: {
    height: 10,
    borderRadius: 6,
    backgroundColor: "var(--panel-2)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: "var(--accent)", borderRadius: 6, minWidth: 4 },
  row: { display: "flex", flexWrap: "wrap", gap: "10px 22px", color: "var(--text)", fontSize: 15 },
  fact: { fontVariantNumeric: "tabular-nums" },
  note: { margin: 0, color: "var(--muted)", fontSize: 13, maxWidth: 900 },
});
