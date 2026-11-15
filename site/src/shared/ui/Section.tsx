import type { PropsWithChildren } from "react";

import { Container } from "./Container";
import { styles } from "./Section.styles";
import { cx } from "./cx";

type SectionProps = PropsWithChildren<{ title?: string; testId?: string; id?: string }>;

export const Section = ({ title, children, testId, id }: SectionProps) => (
  <section id={id} className={cx(styles.section)} data-testid={testId}>
    <Container>
      {title ? (
        <h2 className={cx(styles.title)} data-testid={testId && `${testId}-title`}>
          {title}
        </h2>
      ) : null}
      {children}
    </Container>
  </section>
);
