import { useScrollEdges } from "@/hooks/useScrollEdges";
import { t } from "@/i18n";
import { cx } from "@/ui/cx";
import { Spinner } from "@/ui/Spinner";

import { styles } from "./ActionBar.styles";

export const ROOT = "Actions";

type Props = {
  status: string;
  progress: number;
  /** Что качается сейчас: код языка (null = ядро) и процент файла. */
  active: { lang: string | null; pct: number } | null;
  busy: boolean;
  changes: number;
  /** Нет установки вообще: единственное действие — поставить основной пак. */
  coreOnly: boolean;
  /** Какое действие идёт (лоадер ставим именно на его кнопку). */
  job: "apply" | "uninstall" | null;
  canUninstall: boolean;
  onApply: () => void;
  onUninstall: () => void;
};

/** Нижняя панель: состояние, прогресс и два действия — всегда на виду. */
export const ActionBar = ({
  status,
  progress,
  active,
  busy,
  changes,
  coreOnly,
  job,
  canUninstall,
  onApply,
  onUninstall,
}: Props) => {
  const { bottom } = useScrollEdges();

  return (
    <footer className={cx(styles.bar, bottom && styles.barStuck)} data-testid={ROOT}>
      <div className={cx(styles.inner)}>
        <div className={cx(styles.summary)}>
          {busy ? <Spinner size={15} data-testid={`${ROOT}--spinner`} /> : null}
          <span className={cx(styles.status)} data-testid={`${ROOT}--status`}>
            {busy ? status : status || "—"}
          </span>
        </div>
        {/* Полоса есть всегда (место зарезервировано), но видна только в работе:
            иначе элементы прыгают при старте установки. */}
        <div className={cx(styles.track, !busy && styles.trackIdle)} data-testid={`${ROOT}--progress`}>
          <div
            className={cx(styles.fill, busy && !active && styles.fillIndeterminate)}
            style={busy && !active ? undefined : { width: `${busy ? Math.max(1, progress) : 0}%` }}
            data-testid={`${ROOT}--progress-fill`}
          />
        </div>
        <div className={cx(styles.actions)}>
          <button
            type="button"
            className={cx(styles.danger)}
            data-testid={`${ROOT}--uninstall`}
            disabled={busy || !canUninstall}
            onClick={onUninstall}
          >
            {busy && job === "uninstall" ? <Spinner size={14} /> : null}
            {t("Uninstall mod")}
          </button>
          <button
            type="button"
            className={cx(styles.primary)}
            data-testid={`${ROOT}--apply`}
            disabled={busy || changes === 0}
            onClick={onApply}
          >
            {busy && job === "apply" ? (
              <>
                <Spinner size={15} />
                {active ? `${Math.round(active.pct)}%` : t("Working…")}
              </>
            ) : coreOnly && !busy ? (
              t("Install main pack")
            ) : (
              t("Apply changes")
            )}
          </button>
        </div>
      </div>
    </footer>
  );
};
