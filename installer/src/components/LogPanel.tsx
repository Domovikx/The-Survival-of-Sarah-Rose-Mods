import { useEffect, useRef, useState } from "react";

import { t } from "@/i18n";
import { cx } from "@/ui/cx";

import { styles } from "./LogPanel.styles";

export const ROOT = "Log";

/** Перевод строки без ESC-последовательностей (heredoc их «съедал»). */
const NL = String.fromCharCode(10);

/**
 * Журнал: свёрнут по умолчанию и показывает ПОСЛЕДНЮЮ строку — так видно, что
 * установщик делает прямо сейчас, без раскрытия простыни. Раскрывается для
 * поддержки (полный лог), автоскролл вниз.
 */
export const LogPanel = ({ lines }: { lines: readonly string[] }) => {
  const [open, setOpen] = useState(false);
  const pre = useRef<HTMLPreElement>(null);
  const last = lines.length ? lines[lines.length - 1]! : "";

  useEffect(() => {
    if (open && pre.current) pre.current.scrollTop = pre.current.scrollHeight;
  }, [lines, open]);

  return (
    <section className={cx(styles.panel)} data-testid={ROOT}>
      <button
        type="button"
        className={cx(styles.toggle)}
        data-testid={`${ROOT}--toggle`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={cx(styles.title)}>{t("Log")}</span>
        {open ? null : (
          <span className={cx(styles.hint)} title={last || undefined}>
            {last || "—"}
          </span>
        )}
        <span className={cx(styles.chevron, open && styles.chevronOpen)} aria-hidden>
          ›
        </span>
      </button>
      {open ? (
        <pre ref={pre} className={cx(styles.pre)} data-testid={`${ROOT}--output`}>
          {lines.join(NL) || "—"}
        </pre>
      ) : null}
    </section>
  );
};
