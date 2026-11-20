import { useEffect, useRef, useState } from "react";

import { LANG_LABELS, t, UI_LANGS, type UiLang } from "@/i18n";
import { cx } from "@/ui/cx";

import { styles } from "./LangSwitcher.styles";

export const ROOT = "LangSwitcher";

type Props = { lang: UiLang; onChange: (lang: UiLang) => void };

/** Флаг: круглые SVG с лендинга (MIT, локально в public/flags). */
const Flag = ({ lang }: { lang: string }) => (
  <img className={cx(styles.flag)} src={`/flags/${lang}.svg`} alt="" aria-hidden loading="lazy" />
);

/**
 * Переключатель языка интерфейса — как на сайте: дропдаун с РОДНЫМИ
 * названиями и круглыми флагами, закрытие по Escape/клику мимо, текущий
 * отмечен галочкой. Символ ▼ вместо иконки — дешевле и не ломает вёрстку.
 */
export const LangSwitcher = ({ lang, onChange }: Props) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
        data-testid={ROOT}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={cx(styles.label)}>
          <Flag lang={lang} />
          {LANG_LABELS[lang]}
        </span>
        <span className={cx(styles.chevron)} aria-hidden>
          ▼
        </span>
      </button>

      {open ? (
        <ul role="listbox" aria-label={t("Language")} className={cx(styles.menu)}>
          {UI_LANGS.map((code) => (
            <li key={code} role="option" aria-selected={code === lang}>
              <button
                type="button"
                className={cx(styles.item, code === lang && styles.itemActive)}
                data-testid={`${ROOT}--${code}`}
                onClick={() => {
                  onChange(code);
                  setOpen(false);
                }}
              >
                <span className={cx(styles.label)}>
                  <Flag lang={code} />
                  {LANG_LABELS[code]}
                </span>
                {code === lang ? (
                  <span className={cx(styles.check)} aria-hidden>
                    ✓
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
