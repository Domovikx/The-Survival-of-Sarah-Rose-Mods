import { useTranslation } from "react-i18next";

import { LINKS } from "@/shared/config";
import { Container, cx } from "@/shared/ui";

import { styles } from "./Footer.styles";

export const ROOT = "Footer";

export const Footer = () => {
  const { t } = useTranslation();

  return (
    <footer className={cx(styles.footer)} data-testid={ROOT}>
      <Container>
        <p data-testid={`${ROOT}--disclaimer`}>
          {t(
            "Unofficial fan work. All rights to the original game belong to its rights holders. Use at your own risk.",
          )}
        </p>
        <ul className={cx(styles.links)} aria-label={t("Links")} data-testid={`${ROOT}--links`}>
          <li>
            <a href="#support" data-testid={`${ROOT}--link-support`}>
              {t("Support the project")}
            </a>
          </li>
          <li>
            <a href={LINKS.github} data-testid={`${ROOT}--link-github`} rel="noopener">
              {"GitHub"}
            </a>
          </li>
          <li>
            <a href={LINKS.steam} data-testid={`${ROOT}--link-steam`}>
              {"Steam"}
            </a>
          </li>
          <li>
            <a href={LINKS.license} data-testid={`${ROOT}--link-license`}>
              {"CC BY-NC 4.0"}
            </a>
          </li>
          <li>
            <b data-testid={`${ROOT}--age`}>{"18+"}</b>
          </li>
        </ul>
      </Container>
    </footer>
  );
};
