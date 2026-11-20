import { openUrl } from "@tauri-apps/plugin-opener";

import { LINKS } from "@/core/pack";
import { t } from "@/i18n";
import { cx } from "@/ui/cx";

import { styles } from "./Footer.styles";

export const ROOT = "Footer";

/**
 * Низ окна: «спасибо» и обратная связь. Отдельная полоса с той же шириной
 * колонки, что у контента (1040 по центру), иначе на широком окне текст
 * уезжает к самому краю.
 */
export const Footer = () => (
  <div className={cx(styles.bar)} data-testid={ROOT}>
    <div className={cx(styles.inner)}>
      <span data-testid={`${ROOT}--like`}>{t("Like the patch?")}</span>
      <button
        type="button"
        className={cx(styles.link)}
        data-testid={`${ROOT}--github`}
        onClick={() => void openUrl(LINKS.github)}
      >
        {t("Star on GitHub")}
      </button>
      <span className={cx(styles.dot)}>·</span>
      <button
        type="button"
        className={cx(styles.link)}
        data-testid={`${ROOT}--guide`}
        onClick={() => void openUrl(LINKS.steamGuide)}
      >
        {t("Steam guide")}
      </button>
      <span className={cx(styles.dot)}>·</span>
      <button
        type="button"
        className={cx(styles.link)}
        data-testid={`${ROOT}--issues`}
        onClick={() => void openUrl(LINKS.issues)}
      >
        {t("Report an issue")}
      </button>
      <span className={cx(styles.pushRight)} data-testid={`${ROOT}--version`}>
        v0.1.0 · alpha
      </span>
    </div>
  </div>
);
