import { useEffect, useRef, useState } from "react";

import { t } from "@/i18n";
import { cx } from "@/ui/cx";

import { styles } from "./LogPanel.styles";

export const ROOT = "Log";

/** Журнал: свёрнут по умолчанию (не пугает), разворачивается для поддержки. */
export const LogPanel = ({ lines }: { lines: readonly string[] }) => {
  const [open, setOpen] = useState(false);
  const pre = useRef<HTMLPreElement>(null);

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
        <span className={cx(styles.arrow, open && styles.arrowOpen)}>›</span>
        {t("Details")}
      </button>
      {open ? (
        <pre ref={pre} className={cx(styles.pre)} data-testid={`${ROOT}--output`}>
          {lines.join("\n") || "—"}
        </pre>
      ) : null}
    </section>
  );
};
