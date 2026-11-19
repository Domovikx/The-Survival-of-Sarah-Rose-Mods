import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
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
  lead: { margin: 0, color: "var(--muted)", maxWidth: 900 },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 },
  btn: {
    "display": "inline-flex",
    "alignItems": "center",
    "padding": "10px 16px",
    "borderRadius": 10,
    "textDecoration": "none",
    "fontWeight": 700,
    "color": "#fff",
    "backgroundColor": "var(--accent)",
    ":hover": { filter: "brightness(1.08)" },
  },
  note: { color: "var(--muted)", fontSize: 14 },
  link: { color: "var(--accent)", textDecoration: "none" },
});
