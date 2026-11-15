import { useState } from "react";
import { useTranslation } from "react-i18next";

import { applyTheme, getInitialTheme, type Theme } from "@/shared/lib";
import { cx, MoonIcon, SunIcon } from "@/shared/ui";

import { styles } from "./ThemeToggle.styles";

// Морфинг солнце ↔ луна по паттерну web.dev («Building a theme switch
// component»): обе иконки на месте, переключение — rotate+scale, с учётом
// prefers-reduced-motion.

/** Тема: круглая кнопка с морфингом ☀ (светлая) ↔ 🌙 (тёмная, дефолт проекта). */
export const ThemeToggle = () => {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const isDark = theme === "dark";

  const handleToggle = () => {
    const next: Theme = isDark ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      className={cx(styles.toggle, styles.reducedMotion)}
      aria-label={t("Toggle theme")}
      aria-pressed={isDark}
      data-testid="theme-switch"
      onClick={handleToggle}
    >
      <span className={cx(styles.iconBox)}>
        <span className={cx(styles.icon, isDark && styles.iconHidden)}>
          <SunIcon />
        </span>
        <span className={cx(styles.icon, !isDark && styles.iconHidden)}>
          <MoonIcon />
        </span>
      </span>
    </button>
  );
};
