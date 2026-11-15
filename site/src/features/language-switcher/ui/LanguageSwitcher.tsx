import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { LANGS, LANG_LABELS, setLang, type Lang } from "@/shared/config";
import { cx } from "@/shared/ui";

import { styles } from "./LanguageSwitcher.styles";

/**
 * Язык: дропдаун с РОДНЫМИ названиями + круглые SVG-флаги (набор circle-flags,
 * MIT, локально в public/flags — без внешних запросов). Флаг — это подсказка,
 * язык всё равно подписан текстом (флаг ≠ язык; эмодзи-флаги на Windows не
 * рисуются). Выбор мгновенный, сохраняется в localStorage (setLang),
 * закрытие по клику мимо / Escape; текущий отмечен галочкой.
 */
const flagSrc = (lang: string): string => `${import.meta.env.BASE_URL}flags/${lang}.svg`;

const Flag = ({ lang }: { lang: string }) => (
  <img className={cx(styles.flag)} src={flagSrc(lang)} alt="" aria-hidden loading="lazy" />
);
export const LanguageSwitcher = () => {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = (LANGS as readonly string[]).includes(i18n.resolvedLanguage ?? "")
    ? (i18n.resolvedLanguage as Lang)
    : "en";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={cx(styles.root)} ref={rootRef}>
      <button
        type="button"
        className={cx(styles.button)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("Language")}
        data-testid="lang-switcher"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={cx(styles.label)}>
          <Flag lang={current} />
          {LANG_LABELS[current]}
        </span>
        <span className={cx(styles.chevron)} aria-hidden>
          ▼
        </span>
      </button>
      {open && (
        <ul role="listbox" aria-label={t("Language")} className={cx(styles.menu)}>
          {LANGS.map((lang) => (
            <li key={lang} role="option" aria-selected={lang === current}>
              <button
                type="button"
                className={cx(styles.item, lang === current && styles.itemActive)}
                data-testid={`lang-${lang}`}
                onClick={() => {
                  setLang(lang);
                  setOpen(false);
                }}
              >
                <span className={cx(styles.label)}>
                  <Flag lang={lang} />
                  {LANG_LABELS[lang]}
                </span>
                {lang === current && (
                  <span className={cx(styles.check)} aria-hidden>
                    ✓
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
