import * as stylex from "@stylexjs/stylex";

import { CheckIcon, MinusIcon, PlusIcon } from "@/ui/icons";
import { cx } from "@/ui/cx";
import { Spinner } from "@/ui/Spinner";

/**
 * Индикатор состояния в правой колонке карточки — ОДИН на всё приложение,
 * чтобы «основной пак» и голосовые паки читались одинаково (замечание
 * владельца 2026-11-20: разное поведение даёт диссонанс).
 *
 *   installed — ✓ в круге с подложкой;
 *   add       — + в круге с индиго-рамкой («можно поставить»);
 *   remove    — − в нейтральном круге («будет удалено»);
 *   busy      — спиннер вместо иконки (идёт загрузка).
 */
export type State = "installed" | "add" | "remove" | "busy";

const styles = stylex.create({
  ring: {
    // Блочный элемент: в карточке это элемент раскладки, не текст.
    display: "flex",
    width: 28,
    height: 28,
    borderRadius: "50%",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--muted)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    flexShrink: 0,
    transitionProperty: "color, background-color, border-color",
    transitionDuration: "140ms",
  },
  installed: {
    color: "var(--accent-fg)",
    backgroundColor: "var(--state-bg)",
    borderColor: "var(--state-border)",
  },
  add: { color: "var(--accent-fg)", borderColor: "var(--accent)" },
  remove: { color: "var(--muted)", backgroundColor: "transparent" },
  busy: {
    color: "var(--accent-fg)",
    backgroundColor: "var(--state-bg)",
    borderColor: "var(--state-border)",
  },
});

const ICONS: Record<Exclude<State, "busy">, () => React.ReactElement> = {
  installed: () => <CheckIcon />,
  add: () => <PlusIcon />,
  remove: () => <MinusIcon />,
};

type Props = {
  "state": State;
  /** Дополнительные стили места (например, `grid-area` от карточки). */
  "className"?: string;
  /** Подпись для скринридеров (у немых иконок её нет по умолчанию). */
  "label"?: string;
  "data-testid"?: string;
  "data-state"?: string;
};

export const StateIcon = ({ state, label, className, ...rest }: Props) => (
  <div
    className={[cx(styles.ring, styles[state]), className].filter(Boolean).join(" ")}
    aria-hidden={label ? undefined : true}
    aria-label={label}
    role={label ? "img" : undefined}
    {...rest}
  >
    {state === "busy" ? <Spinner /> : ICONS[state]()}
  </div>
);
