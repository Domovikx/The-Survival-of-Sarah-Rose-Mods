import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12,
  },
  figure: {
    margin: 0,
  },
  // Кликабельная миниатюра: hover — affordance (лёгкий зум + яркость).
  imgButton: {
    "display": "block",
    "width": "100%",
    "padding": 0,
    "margin": 0,
    // ВАЖНО: StyleX молча выбрасывает shorthand `background:`/`border:` —
    // только backgroundColor/backgroundImage и borderWidth/Style/Color.
    // Явно гасим и UA-обводку кнопки.
    "backgroundColor": "transparent",
    "borderWidth": 0,
    "cursor": "pointer",
    "borderRadius": 10,
    ":focus-visible": { outline: "2px solid var(--link)", outlineOffset: 2 },
  },
  img: {
    "width": "100%",
    "height": "auto",
    "borderRadius": 10,
    "borderWidth": 1,
    "borderStyle": "solid",
    "borderColor": "var(--border)",
    "display": "block",
    "transition": "transform .18s ease, filter .18s ease",
    ":hover": {
      transform: "scale(1.02)",
      filter: "brightness(1.08)",
    },
  },
  caption: {
    fontSize: 14,
    color: "var(--muted)",
    marginTop: 6,
  },
  // ——— Лайтбокс ———
  overlay: {
    "position": "fixed",
    "top": 0,
    "right": 0,
    "bottom": 0,
    "left": 0,
    "zIndex": 1000,
    // Тон в гамме --bg тёмной темы (#141824): слой лайтбокса всегда тёмный
    // (как Steam-кнопка — фиксированные цвета независимо от темы страницы).
    "backgroundColor": "rgba(16, 20, 32, .9)",
    // Размытие фона — мягче, чем сплошная чернота («не страшно»).
    "WebkitBackdropFilter": "blur(10px)",
    "backdropFilter": "blur(10px)",
    "display": "flex",
    "alignItems": "center",
    "justifyContent": "center",
    "overscrollBehavior": "contain",
    "touchAction": "pan-y",
    "userSelect": "none",
    // Фокус-контейнер (APG: tabindex=-1, фокус при открытии).
    ":focus": { outline: "none" },
  },
  overlayHidden: {
    opacity: 0,
    transition: "opacity .18s ease",
  },
  overlayShown: {
    opacity: 1,
    transition: "opacity .18s ease",
  },
  viewer: {
    // Относительный контейнер — стрелки ‹ › живут у самой картинки.
    "position": "relative",
    "display": "flex",
    "flexDirection": "column",
    "alignItems": "center",
    "maxWidth": "min(96vw, calc(76vh * 1.78))", // 16:9 ограничение по высоте
    ":focus": { outline: "none" },
  },
  overlayImg: {
    "maxWidth": "100%",
    "maxHeight": "72vh",
    "width": "auto",
    "height": "auto",
    "objectFit": "contain",
    "borderRadius": 10,
    // Без обводки вообще — фото «плавает» на размытом фоне (канон PhotoSwipe);
    // отделение даёт только тень.
    "display": "block",
    "boxShadow": "0 20px 56px rgba(0, 0, 0, .55)",
    "@media (max-width: 759px)": { maxHeight: "64vh" },
  },
  // Счётчик + подпись — одна строкой ПОД картинкой (как в PhotoSwipe),
  // без «плавающих» угловых элементов.
  metaRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    marginTop: 10,
    fontSize: 14,
    maxWidth: "100%",
  },
  counter: {
    color: "#9aa4bc", // --muted тёмной темы (слой всегда тёмный)
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  overlayCaption: {
    color: "#9aa4bc",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  close: {
    "position": "absolute",
    "top": 14,
    "right": 16,
    "width": 44,
    "height": 44,
    "padding": 0,
    "borderRadius": 999,
    "borderWidth": 0,
    // Тёмная пилюля как в Segmented (panel-2), только без обводки: хром
    // лайтбокса живёт на тёмном слое — светлые --border/--muted световой
    // темы дали бы «белое кольцо» (кринж v2). Цвета — из тёмной темы.
    "backgroundColor": "rgba(35, 43, 63, .82)",
    "WebkitBackdropFilter": "blur(6px)",
    "backdropFilter": "blur(6px)",
    "color": "#e8ebf2",
    "fontSize": 26,
    "lineHeight": "42px",
    "cursor": "pointer",
    "transition": "background-color 150ms ease, color 150ms ease, box-shadow 150ms ease",
    ":hover": {
      backgroundColor: "var(--accent)",
      color: "#fff",
      boxShadow: "0 4px 16px color-mix(in srgb, var(--accent) 45%, transparent)",
    },
    ":focus-visible": { outline: "2px solid #9aa6f5", outlineOffset: 2 },
  },
  arrow: {
    "position": "absolute",
    "top": "50%",
    "transform": "translateY(-50%)",
    "width": 52,
    "height": 52,
    "padding": 0,
    "borderRadius": 999,
    "borderWidth": 0,
    // Как close: тёмная пилюля без белых обводок, hover — акцент сайта.
    "backgroundColor": "rgba(35, 43, 63, .82)",
    "WebkitBackdropFilter": "blur(6px)",
    "backdropFilter": "blur(6px)",
    "color": "#e8ebf2",
    "fontSize": 32,
    "lineHeight": "48px",
    "cursor": "pointer",
    "transition": "background-color 150ms ease, color 150ms ease, box-shadow 150ms ease, transform 150ms ease",
    ":hover": {
      backgroundColor: "var(--accent)",
      color: "#fff",
      boxShadow: "0 4px 16px color-mix(in srgb, var(--accent) 45%, transparent)",
      transform: "translateY(-50%) scale(1.06)",
    },
    ":focus-visible": { outline: "2px solid #9aa6f5", outlineOffset: 2 },
  },
  arrowLeft: {
    "left": -68,
    // На узких экранах стрелки накладываются на края картинки.
    "@media (max-width: 759px)": { left: 8 },
  },
  arrowRight: {
    "right": -68,
    "@media (max-width: 759px)": { right: 8 },
  },
});
