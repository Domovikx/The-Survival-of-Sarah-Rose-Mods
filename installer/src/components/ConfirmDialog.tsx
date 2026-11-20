import { useEffect } from "react";

import type { ConfirmRequest } from "@/hooks/useInstaller";
import { t } from "@/i18n";
import { cx } from "@/ui/cx";

import { styles } from "./ConfirmDialog.styles";

export const ROOT = "Confirm";

type Props = { request: ConfirmRequest; onClose: () => void };

/** Свой диалог вместо window.confirm: выглядит как приложение, а не как Windows 95. */
export const ConfirmDialog = ({ request, onClose }: Props) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={cx(styles.overlay)} data-testid={ROOT} role="presentation" onClick={onClose}>
      <div
        className={cx(styles.card)}
        role="alertdialog"
        aria-modal="true"
        aria-label={request.title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={cx(styles.title)} data-testid={`${ROOT}--title`}>
          {request.title}
        </h2>
        {request.detail ? <p className={cx(styles.detail)}>{request.detail}</p> : null}
        <div className={cx(styles.actions)}>
          <button
            type="button"
            className={cx(styles.ghost)}
            data-testid={`${ROOT}--cancel`}
            onClick={onClose}
            autoFocus
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            className={cx(styles.confirm, request.danger && styles.confirmDanger)}
            data-testid={`${ROOT}--ok`}
            onClick={() => {
              onClose();
              request.run();
            }}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
