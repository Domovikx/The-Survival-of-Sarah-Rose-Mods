import logoUrl from "@/assets/logo.svg";
import { useScrollEdges } from "@/hooks/useScrollEdges";
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
export const Header = ({ lang, onChange }: Props) => {
  const { top } = useScrollEdges();

  return (
    <header className={cx(styles.header, top && styles.headerScrolled)} data-testid={ROOT}>
      <div className={cx(styles.inner)}>
        {/* Глиф без подложки: в шапке это знак приложения, а не кнопка. */}
        <img className={cx(styles.logo)} src={logoUrl} alt="" data-testid={`${ROOT}--logo`} />
        <div className={cx(styles.titles)}>
          <h1 className={cx(styles.title)}>TSSR AI Voice Pack</h1>
          <p className={cx(styles.sub)}>{t("Windows · official Steam version only")}</p>
        </div>
        <div className={cx(styles.right)}>
          <LangSwitcher lang={lang} onChange={onChange} />
        </div>
      </div>
    </header>
  );
};
