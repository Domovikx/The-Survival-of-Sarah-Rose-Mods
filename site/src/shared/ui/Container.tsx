import type { PropsWithChildren } from "react";

import { styles } from "./Container.styles";
import { cx } from "./cx";

export const Container = ({ children }: PropsWithChildren) => <div className={cx(styles.wrap)}>{children}</div>;
