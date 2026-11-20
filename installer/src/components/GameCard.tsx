import type { GameInfo } from "@/core/types";
import { t } from "@/i18n";
import { cx } from "@/ui/cx";

import { styles } from "./GameCard.styles";

export const ROOT = "Game";

type Props = {
  game: GameInfo | null;
  detected: boolean;
  busy: boolean;
  onRedetect: () => void;
};

/** Где игра: путь, сборка Steam и кнопка повторного поиска. */
export const GameCard = ({ game, detected, busy, onRedetect }: Props) => (
  <section className={cx(styles.card)} data-testid={ROOT}>
    <div className={cx(styles.head)}>
      <h2 className={cx(styles.title)}>{t("Game")}</h2>
      {detected ? (
        <span className={cx(styles.status, !game && styles.statusBad)} data-testid={`${ROOT}--status`}>
          {game ? t("installed") : t("not found")}
        </span>
      ) : null}
    </div>
    <div className={cx(styles.row)}>
      <span className={cx(styles.key)}>{t("Folder")}</span>
      <p className={cx(styles.value)} data-testid={`${ROOT}--path`}>
        {game?.path ?? (detected ? t("game not found") : "…")}
      </p>
    </div>
    <div className={cx(styles.row)}>
      <span className={cx(styles.key)}>{t("Steam build")}</span>
      <p className={cx(styles.value)} data-testid={`${ROOT}--build`}>
        {game?.build_id ?? "—"}
      </p>
    </div>
    <div className={cx(styles.actions)}>
      <button
        type="button"
        className={cx(styles.ghost)}
        data-testid={`${ROOT}--detect`}
        onClick={onRedetect}
        disabled={busy}
      >
        {t("Detect again")}
      </button>
    </div>
  </section>
);
