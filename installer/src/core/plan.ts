/**
 * План установки — чистая логика (без Tauri и DOM), поэтому её можно тестировать.
 *
 * Правила:
 *   • ядро обязательно и ставится ПЕРВЫМ (без него голоса бесполезны);
 *   • язык ставим только если его нет в игре (повторный клик ничего не качает);
 *   • язык, который уже стоит, в план не попадает (для него есть «Remove»).
 */
import { CORE_ASSET, voiceAsset } from "./pack";

export type ComponentKind = "core" | "lang";

export type InstallItem = {
  kind: ComponentKind;
  /** Код языка (только для kind === "lang"). */
  lang?: string;
  /** Имя ассета в релизе. */
  asset: string;
};

export type PlanInput = {
  coreInstalled: boolean;
  /** Что пользователь отметил галочками. */
  selected: readonly string[];
  /** Что уже лежит в игре. */
  installed: readonly string[];
};

export const buildPlan = ({ coreInstalled, selected, installed }: PlanInput): InstallItem[] => {
  const plan: InstallItem[] = [];
  if (!coreInstalled) plan.push({ kind: "core", asset: CORE_ASSET });
  const have = new Set(installed);
  for (const lang of selected) {
    if (have.has(lang)) continue;
    plan.push({ kind: "lang", lang, asset: voiceAsset(lang) });
  }
  return plan;
};

/** Человеческая подпись пункта плана — для лога. */
export const describeItem = (item: InstallItem): string =>
  item.kind === "core" ? "Main pack (texts, fonts, mod menu)" : `Voice: ${item.lang?.toUpperCase() ?? "?"}`;

/**
 * Разница «переключатели vs реальность» для кнопки Apply:
 *   install — включили, но в игре нет; remove — выключили, а в игре стоит.
 *
 * Чистая функция (без Tauri/DOM): именно её поведение — суть UI с тумблерами,
 * поэтому она покрыта тестами.
 */
export type LangDiff = { install: string[]; remove: string[] };

export const diffLangs = (
  all: readonly string[],
  desired: ReadonlyMap<string, boolean>,
  installed: ReadonlySet<string>,
): LangDiff => ({
  install: all.filter((lang) => desired.get(lang) === true && !installed.has(lang)),
  remove: all.filter((lang) => desired.get(lang) === false && installed.has(lang)),
});
