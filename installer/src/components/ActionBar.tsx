import { t } from "@/i18n";
import { cx } from "@/ui/cx";

import { styles } from "./ActionBar.styles";

export const ROOT = "Actions";

type Props = {
  status: string;
  progress: number;
  busy: boolean;
  changes: number;
  canUninstall: boolean;
  onApply: () => void;
  onUninstall: () => void;
};

/** Нижняя панель: состояние, прогресс и два действия — всегда на виду. */
export const ActionBar = ({ status, progress, busy, changes, canUninstall, onApply, onUninstall }: Props) => (
  <footer className={cx(styles.bar)} data-testid={ROOT}>
    <div className={cx(styles.summary)}>
      <span className={cx(styles.status)} data-testid={`${ROOT}--status`}>
        {busy ? status : status || "—"}
      </span>
    </div>
    {busy ? (
      <div className={cx(styles.track)} data-testid={`${ROOT}--progress`}>
        <div className={cx(styles.fill)} style={{ width: `${Math.max(2, progress)}%` }} />
      </div>
    ) : null}
    <div className={cx(styles.actions)}>
      <button
        type="button"
        className={cx(styles.danger)}
        data-testid={`${ROOT}--uninstall`}
        disabled={busy || !canUninstall}
        onClick={onUninstall}
      >
        {t("Uninstall mod")}
      </button>
      <button
        type="button"
        className={cx(styles.primary)}
        data-testid={`${ROOT}--apply`}
        disabled={busy || changes === 0}
        onClick={onApply}
      >
        {busy ? t("Working…") : t("Apply changes")}
      </button>
    </div>
  </footer>
);
