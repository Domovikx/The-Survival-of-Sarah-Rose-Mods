import { openUrl } from "@tauri-apps/plugin-opener";

import { LINKS } from "@/core/pack";
import { useScrollEdges } from "@/hooks/useScrollEdges";
import { t } from "@/i18n";
import { cx } from "@/ui/cx";
import { CheckIcon, PlayIcon } from "@/ui/icons";
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
  /** Помечено «снять всё»: кнопка честно говорит, что произойдёт. */
  removeAll: boolean;
  /** Мод стоит и применять нечего: финал, а не «мёртвая» кнопка. */
  ready: boolean;
  canUninstall: boolean;
  onApply: () => void;
  onUninstall: () => void;
};

/** Нижняя панель: состояние, прогресс и действия — всегда на виду. */
export const ActionBar = ({
  status,
  progress,
  active,
  busy,
  changes,
  coreOnly,
  job,
  removeAll,
  ready,
  canUninstall,
  onApply,
  onUninstall,
}: Props) => {
  const { bottom } = useScrollEdges();

  return (
    <footer className={cx(styles.bar, bottom && styles.barStuck)} data-testid={ROOT}>
      <div className={cx(styles.inner)}>
        <div className={cx(styles.summary, ready && styles.summaryReady)}>
          {busy ? <Spinner size={15} data-testid={`${ROOT}--spinner`} /> : null}
          {ready ? <CheckIcon size={15} /> : null}
          <span
            className={cx(styles.status, ready && styles.statusReady)}
            data-testid={`${ROOT}--status`}
            data-state={busy ? "busy" : ready ? "ready" : "idle"}
            title={status || undefined}
          >
            {busy ? status : status || "—"}
          </span>
        </div>
        {/* Полоса есть всегда (место зарезервировано), но видна только в работе:
            иначе элементы прыгают при старте установки. */}
        <div
          className={cx(styles.track, !busy && styles.trackIdle)}
          data-testid={`${ROOT}--progress`}
          data-state={busy ? (active ? "percent" : "indeterminate") : "idle"}
        >
          <div
            className={cx(styles.fill, busy && !active && styles.fillIndeterminate)}
            style={busy && !active ? undefined : { width: `${busy ? Math.max(1, progress) : 0}%` }}
            data-testid={`${ROOT}--progress-fill`}
          />
        </div>
        <div className={cx(styles.actions)}>
          {/* Пока висит пометка «снять всё», вторая кнопка удаления не нужна:
              одно действие — одна кнопка (иначе два одинаковых выбора). */}
          {removeAll ? null : (
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
          )}
          {/* ФИНАЛ: применять нечего — вместо неактивной «Применить изменения»
              кнопка, которая ведёт в игру (замечание владельца 2026-11-21). */}
          {ready ? (
            <button
              type="button"
              className={cx(styles.primary)}
              data-testid={`${ROOT}--play`}
              onClick={() => void openUrl(LINKS.runGame)}
            >
              <PlayIcon size={15} />
              {t("Play")}
            </button>
          ) : (
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
                  {/* Процент кнопки = ОБЩИЙ прогресс плана, как у полосы:
                      процент текущего файла показан в его карточке, и два
                      разных числа рядом читались как ошибка. */}
                  {active ? `${Math.round(progress)}%` : t("Working…")}
                </>
              ) : removeAll ? (
                t("Remove everything")
              ) : coreOnly && !busy ? (
                t("Install main pack")
              ) : (
                t("Apply changes")
              )}
            </button>
          )}
        </div>
      </div>
    </footer>
  );
};
