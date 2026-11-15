import { useTranslation } from "react-i18next";

import { LanguageSwitcher } from "@/features/language-switcher";
import { ThemeToggle } from "@/features/theme-toggle";
import { LINKS } from "@/shared/config";
import { Container, cx, SteamIcon } from "@/shared/ui";

import { styles } from "./Header.styles";

export const Header = () => {
  const { t } = useTranslation();

  return (
    <header className={cx(styles.header)} data-testid="header">
      <Container>
        <div className={cx(styles.inner)} data-testid="header-inner">
          <a className={cx(styles.brand)} href="/" data-testid="header-brand">
            {t("TSSR · AI voice pack")}
          </a>
          <a className={cx(styles.steamLink)} href={LINKS.steam} data-testid="steam-link">
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
