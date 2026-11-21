import { useScrollEdges } from "@/hooks/useScrollEdges";
import { type UiLang } from "@/i18n";
import { LogoMark } from "@/ui/LogoMark";
import { LangSwitcher } from "./LangSwitcher";
import { cx } from "@/ui/cx";

import { styles } from "./Header.styles";

/** Корень для e2e/тестов: id собираются от ROOT через `--`. */
export const ROOT = "Header";

type Props = {
  lang: UiLang;
  onChange: (lang: UiLang) => void;
};

/** Шапка: логотип, название и переключатель языка интерфейса. */
export const Header = ({ lang, onChange }: Props) => {
  const { top } = useScrollEdges();

  return (
    <header className={cx(styles.header, top && styles.headerScrolled)} data-testid={ROOT}>
      <div className={cx(styles.inner)} data-testid={`${ROOT}--inner`}>
        {/* Глиф без подложки: в шапке это знак приложения, а не кнопка. */}
        <LogoMark className={cx(styles.logo)} data-testid={`${ROOT}--logo`} />
        <div className={cx(styles.titles)} data-testid={`${ROOT}--titles`}>
          {/* Полное имя игры, а не аббревиатура: «TSSR» ничего не говорит
              человеку, который просто скачал мод (замечание 2026-11-20). */}
          <h1 className={cx(styles.title)} data-testid={`${ROOT}--title`}>
            The Survival of Sarah Rose
          </h1>
        </div>
        <div className={cx(styles.right)} data-testid={`${ROOT}--lang`}>
          <LangSwitcher lang={lang} onChange={onChange} />
        </div>
      </div>
    </header>
  );
};
