import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  card: {
    "cursor": "pointer",
    // Ширина колонки: 1 колонка на узком окне, 2 на среднем, 3 на широком.
    // Последняя неполная строка центрируется родителем (justify-content).
    "flexBasis": "100%",
    "@media (min-width: 640px)": { flexBasis: "calc((100% - 10px) / 2)" },
    "@media (min-width: 1000px)": { flexBasis: "calc((100% - 20px) / 3)" },
    "display": "grid",
    "gridTemplateColumns": "24px 1fr auto",
    "gridTemplateAreas": '"flag head switch" "flag meta switch"',
    "alignItems": "center",
    "columnGap": 12,
    "rowGap": 2,
    "padding": "12px 14px",
    "borderRadius": 12,
    "borderWidth": 1,
    "borderStyle": "solid",
    "borderColor": "var(--border)",
    // Заливки нет: неустановленный язык читается как «фон», а не как плитка.
    // Плиткой становится только установленный (см. `installed`).
    "transitionProperty": "border-color, background-color, box-shadow",
    "transitionDuration": "140ms",
    // Один hover-паттерн на всё приложение: рамка accent-fg (как у кнопок и
    // переключателя языка); фон не меняем, чтобы не «прыгали» залитые карточки.
    ":hover": { borderColor: "var(--accent-fg)" },
    // Только клавиатурный фокус: после клика мышью рамка не нужна.
    ":has(input:focus-visible)": { outline: "2px solid var(--accent-fg)", outlineOffset: 2 },
  },
  // Установлено: плитка с заливкой и индиго-рамкой. Это единственный
  // «включённый» вид — неустановленные остаются прозрачными (2026-11-20).
  installed: {
    borderColor: "var(--state-border)",
    backgroundColor: "var(--panel-2)",
  },
  // Пунктира в интерфейсе нет нигде (как и на лендинге): состояние несут
  // цвет рамки, свечение и иконка, а не тип линии (2026-11-20).
  // Прибавление — индиго-рамка + мягкое свечение токеном (не color-mix:
  // браузер его не считал, и рамка выходила ярче нужного).
  pendingAdd: {
    borderColor: "var(--accent)",
    boxShadow: "0 0 0 3px var(--state-bg)",
  },
  busy: { opacity: 0.55, pointerEvents: "none" },
  // Флаги в наборе — КРУГЛЫЕ (circle-flags): держим квадрат 22×22 и круглый
  // крой, иначе получается «прямоугольник с обрезанным кружком» (2026-11-20).
  flag: {
    gridArea: "flag",
    width: 22,
    height: 22,
    borderRadius: "50%",
    objectFit: "contain",
    flexShrink: 0,
    boxShadow: "0 0 0 1px var(--border)",
  },
  head: { gridArea: "head", display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 },
  name: { fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  code: { marginLeft: 6, fontSize: 11.5, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.4px" },
  meta: { gridArea: "meta", fontSize: 12.5, color: "var(--muted)", fontVariantNumeric: "tabular-nums" },
  metaOk: { color: "var(--accent-fg)" },
  metaAdd: { color: "var(--accent-fg)" },
  metaRemove: { color: "var(--muted)" },
  /** Иконка состояния в правой колонке (✓ / + / −). */
  stateIcon: {
    gridArea: "switch",
    width: 28,
    height: 28,
    borderRadius: "50%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--muted)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    transitionProperty: "color, background-color, border-color",
    transitionDuration: "140ms",
  },
  stateOn: {
    color: "var(--accent-fg)",
    backgroundColor: "var(--state-bg)",
    borderColor: "var(--state-border)",
  },
  stateAdd: {
    color: "var(--accent-fg)",
    borderColor: "var(--accent)",
  },
  /** Идёт загрузка: рамка светится, иконка вращается. */
  stateBusy: {
    color: "var(--accent-fg)",
    borderColor: "var(--state-border)",
    backgroundColor: "var(--state-bg)",
  },
  stateRemove: {
    color: "var(--muted)",
    backgroundColor: "transparent",
    borderColor: "var(--border)",
  },
  input: { position: "absolute", opacity: 0, width: 0, height: 0 },
});
