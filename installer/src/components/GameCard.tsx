import { openUrl } from "@tauri-apps/plugin-opener";

import { LINKS } from "@/core/pack";
import type { GameInfo } from "@/core/types";
import { t } from "@/i18n";
import { ExternalIcon } from "@/ui/icons";
import { StateIcon } from "@/ui/StateIcon";
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
    <div className={cx(styles.head)} data-testid={`${ROOT}--head`}>
      <h2 className={cx(styles.title)} data-testid={`${ROOT}--title`}>
        {t("Game")}
      </h2>
      {/* Ссылка на страницу игры в Steam: «официальная версия» просит, чтобы
          её можно было открыть. Стоит в строке «Игра», в колонке значений —
          ровно над путём (перенос из шапки, 2026-11-21). */}
      <button
        type="button"
        className={cx(styles.subLink)}
        data-testid={`${ROOT}--steam`}
        onClick={() => void openUrl(LINKS.steamStore)}
      >
        {t("AI voice pack · Windows · only the official Steam version")}
        <ExternalIcon />
      </button>
      {/* Состояние — тот же индикатор, что у пакетов: ✓ найдена · ! не найдена. */}
      {detected ? (
        <StateIcon
          state={game ? "installed" : "missing"}
          label={game ? t("installed") : t("not found")}
          data-testid={`${ROOT}--status`}
          data-state={game ? "installed" : "missing"}
        />
      ) : null}
    </div>
    <div className={cx(styles.row)} data-testid={`${ROOT}--row-folder`}>
      <span className={cx(styles.key)} data-testid={`${ROOT}--folder-key`}>
        {t("Folder")}
      </span>
      <p className={cx(styles.value, styles.path)} data-testid={`${ROOT}--path`} title={game?.path}>
        {game?.path ?? (detected ? t("game not found") : "…")}
      </p>
      <button
        type="button"
        className={cx(styles.ghost, styles.detect)}
        data-testid={`${ROOT}--detect`}
        onClick={onRedetect}
        disabled={busy}
      >
        {t("Detect again")}
      </button>
    </div>
    <div className={cx(styles.row)} data-testid={`${ROOT}--row-build`}>
      <span className={cx(styles.key)} data-testid={`${ROOT}--build-key`}>
        {t("Steam build")}
      </span>
      <p className={cx(styles.value)} data-testid={`${ROOT}--build`}>
        {game?.build_id ?? "—"}
      </p>
    </div>
  </section>
);
