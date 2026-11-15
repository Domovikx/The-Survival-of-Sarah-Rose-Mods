import { useTranslation } from "react-i18next";

import { LanguageSwitcher } from "@/features/language-switcher";
import { ThemeToggle } from "@/features/theme-toggle";
import { LINKS } from "@/shared/config";
import { Container, cx, SteamIcon } from "@/shared/ui";

import { styles } from "./Header.styles";

export const ROOT = "Header";

export const Header = () => {
  const { t } = useTranslation();

  return (
    <header className={cx(styles.header)} data-testid={ROOT}>
      <Container>
        <div className={cx(styles.inner)} data-testid={`${ROOT}--inner`}>
          <a className={cx(styles.brand)} href="/" data-testid={`${ROOT}--brand`}>
            {t("TSSR · AI voice pack")}
          </a>
          <a className={cx(styles.steamLink)} href={LINKS.steam} data-testid={`${ROOT}--steam-link`}>
            <SteamIcon size={16} />
            {t("Steam page")}
          </a>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </Container>
    </header>
  );
};
