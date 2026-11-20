import iconUrl from "@/assets/icon.png";
import { t, type UiLang } from "@/i18n";
import { LangSwitcher } from "./LangSwitcher";
import { cx } from "@/ui/cx";

import { styles } from "./Header.styles";

/** Корень для e2e/тестов: id собираются от ROOT через `--`. */
export const ROOT = "Header";

type Props = {
  lang: UiLang;
  onChange: (lang: UiLang) => void;
};

/** Шапка: наш логотип, название и переключатель языка интерфейса. */
export const Header = ({ lang, onChange }: Props) => (
  <header className={cx(styles.header)} data-testid={ROOT}>
    <img className={cx(styles.logo)} src={iconUrl} alt="" />
    <div className={cx(styles.titles)}>
      <h1 className={cx(styles.title)}>TSSR AI Voice Pack</h1>
      <p className={cx(styles.sub)}>{t("Windows · official Steam version only")}</p>
    </div>
    <div className={cx(styles.right)}>
      <LangSwitcher lang={lang} onChange={onChange} />
      <span className={cx(styles.alpha)} data-testid={`${ROOT}--alpha`}>
        alpha
      </span>
    </div>
  </header>
);
