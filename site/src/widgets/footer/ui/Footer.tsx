import { useTranslation } from "react-i18next";

import { LINKS } from "@/shared/config";
import { Container, cx } from "@/shared/ui";

import { styles } from "./Footer.styles";

export const Footer = () => {
  const { t } = useTranslation();

  return (
    <footer className={cx(styles.footer)} data-testid="footer">
      <Container>
        <p data-testid="footer-disclaimer">
          {t(
            "Unofficial fan work. All rights to the original game belong to its rights holders. Use at your own risk.",
          )}
        </p>
        <ul className={cx(styles.links)} aria-label={t("Links")} data-testid="footer-links">
          <li>
            <a href="#support" data-testid="footer-link-support">
              {t("Support the project")}
            </a>
          </li>
          <li>
            <a href={LINKS.nexus} data-testid="footer-link-nexus">
              {"Nexus Mods"}
            </a>
          </li>
          <li>
            <a href={LINKS.steam} data-testid="footer-link-steam">
              {"Steam"}
            </a>
          </li>
          <li>
            <a href={LINKS.license} data-testid="footer-link-license">
              {"CC BY-NC 4.0"}
            </a>
          </li>
          <li>
            <b data-testid="footer-age">{"18+"}</b>
          </li>
        </ul>
      </Container>
    </footer>
  );
};
