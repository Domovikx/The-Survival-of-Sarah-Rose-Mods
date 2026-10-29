/**
 * arc_branching.mts — архитектура ветвления арок TSSR в виде диаграммы
 * PlantUML (state diagram, рендерится в превью jebbs.plantuml в VS Code).
 *
 * ЕДИНСТВЕННЫЙ источник истины — сама игра: `game/*.rpy` (скрипт рядом с
 * script.rpy: prosalaric.rpy и пр.; мимо tl/, mods/, renpy/). Читаются
 * только переходы `jump`/`call` и определения `label` — никаких наших
 * промежуточных артефактов (template.pot НЕ участвует, 2026-10-29).
 *
 * Правило «лейбл → арка» — то же самое, что в ПОТЕ (ARC_BY_LABEL /
 * ARC_BY_PREFIX: арка выводится из имён лейблов самой игры): переиспользуем
 * `arcOfLabel` из renpy-po/game_source.mts (общий слой, вынесенный из
 * potgen), чтобы диаграмма и POT всегда согласованы (DRY), а не расходились
 * после правки правил.
 *
 * Уровни диаграммы = BFS-глубина от стартовых арок: «старт > арка > арка >
 * …» с видимым ветвлением, где каждая арка ровно на своём уровне.
 *
 * Запуск (пишет docs/game-branching.puml):
 *   node .opencode/skills/arc-branching/arc_branching.mts [--out <файл>]
 *
 * Тесты: arc_branching.test.mts (юнит) + arc_branching_e2e.test.mts
 * (против реальной установки игры).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { NO_ARC_FILES, arcOfLabel, collectRpyFiles } from "../renpy-po/game_source.mts";

/** Корень репозитория (скилл лежит в .opencode/skills/<имя>/). */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Шаблон POT в репе — источник счётчика строк (тот же скан игры, что и
 *  сам POT; дедуп по uid = ровно те файлы, что реально озвучиваются). */
export const POT_PATH = join(REPO_ROOT, "patches", "ai-voice-pack", "po", "template.pot");

/** Игровая папка — единственный источник данных. TSSR_GAME переопределяет. */
export const GAME =
  process.env.TSSR_GAME ?? "C:/Program Files (x86)/Steam/steamapps/common/The Survival of Sarah Rose/game";

/** Куда пишется диаграмма по умолчанию. */
export const DEFAULT_OUT = join(REPO_ROOT, "docs", "game-branching.puml");

/** Ребро между арками: weight = сколько label-переходов ведут из from в to. */
export interface ArcEdge {
  from: string;
  to: string;
  weight: number;
}

/** Полная модель ветвления для рендера. */
export interface BranchingModel {
  /** Арки в порядке первого появления лейбла в файлах игры. */
  arcs: string[];
  /** Рёбра между арками (межарочные; петли внутри одной арки отброшены). */
  edges: ArcEdge[];
  /** Стартовые арки (без входящих переходов); если таких нет — первая арка. */
  roots: string[];
  /** Уровень каждой арки (BFS-глубина от стартовых арок). */
  depth: Map<string, number>;
  /** Арки, сгруппированные по уровню: levels[i] — арки глубины i. */
  levels: string[][];
  /** Сколько озвучиваемых фраз в арке (арка -> строк) — из POT. */
  lines?: ReadonlyMap<string, number>;
}

/** Один .rpy-файл игры: путь (для правил аркификации) + текст. */
export interface RpySource {
  path: string;
  text: string;
}

/** Разобранный файл: определённые label и переходы из их блоков. */
export interface ParsedRpy {
  labels: string[];
  /** [откуда, куда] — только внутри блока своего label (см. ниже). */
  jumps: Array<[string, string]>;
}

/**
 * label и jump/call одного файла.
 *
 * Принцип: держим «текущий label»; `jump`/`call` засчитываются только пока
 * стоим в блоке (строка label начинает новый блок). Так переход из чужого
 * блока или случайное совпадение в комментарии не становится рёбром.
 * Условные (`jump X if y`) и экранные (`call screen foo`) вызовы ловятся
 * по первому токену-имени; фильтрация «имя реально определено как label»
 * отсекает мусор (`screen`, `expression` и т.п.) уже в buildModel.
 */
export function parseRpy(text: string): ParsedRpy {
  const labels: string[] = [];
  const jumps: Array<[string, string]> = [];
  let current: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const labelMatch = /^\s*label\s+([A-Za-z0-9_]+)/.exec(raw);
    if (labelMatch) {
      current = labelMatch[1];
      labels.push(current);
      continue;
    }
    if (current === null) continue;
    const jumpMatch = /^\s*(?:jump|call)\s+([A-Za-z0-9_]+)/.exec(raw);
    if (jumpMatch) jumps.push([current, jumpMatch[1]]);
  }
  return { labels, jumps };
}

/**
 * label-переходы → арочные рёбра.
 *
 * Гарды: конечная цель обязана быть определённым label игры (иначе
 * `call screen foo` даст фейковую арку «screen»); обе арки должны быть
 * известны (галерея/реплеи и splashscreen без арки — молча мимо); петли
 * внутри одной арки не являются ветвлением и отбрасываются.
 */
export function toArcEdges(
  labelJumps: Array<[string, string]>,
  arcOf: (label: string) => string | undefined,
  definedLabels: ReadonlySet<string>,
): ArcEdge[] {
  const weights = new Map<string, number>();
  for (const [fromLabel, toLabel] of labelJumps) {
    if (!definedLabels.has(toLabel)) continue;
    const from = arcOf(fromLabel);
    const to = arcOf(toLabel);
    if (!from || !to || from === to) continue;
    const key = `${from}\u0000${to}`; // NUL: имена арок могут содержать пробелы
    weights.set(key, (weights.get(key) ?? 0) + 1);
  }
  return [...weights.entries()].map(([key, weight]) => {
    const sep = key.indexOf("\u0000");
    return { from: key.slice(0, sep), to: key.slice(sep + 1), weight };
  });
}

/** Арки в порядке первого появления их лейблов (в порядке файлов/строк). */
export function arcOrder(labelOrder: string[], arcOf: (label: string) => string | undefined): string[] {
  const arcs: string[] = [];
  for (const label of labelOrder) {
    const arc = arcOf(label);
    if (arc && !arcs.includes(arc)) arcs.push(arc);
  }
  return arcs;
}

/**
 * BFS-глубина от стартовых арок = «уровни» диаграммы. Циклы безопасны:
 * арка, уже посещённая на меньшей/равной глубине, не переиспользуется.
 */
export function buildLevels(arcs: string[], edges: ArcEdge[]): BranchingModel {
  const outs = new Map<string, ArcEdge[]>(arcs.map((a) => [a, []]));
  const ins = new Map<string, number>(arcs.map((a) => [a, 0]));
  for (const e of edges) {
    const list = outs.get(e.from);
    if (!list) continue;
    list.push(e);
    if (ins.has(e.to)) ins.set(e.to, (ins.get(e.to) ?? 0) + 1);
  }

  const entries = arcs.filter((a) => (ins.get(a) ?? 0) === 0);
  const roots = entries.length > 0 ? entries : arcs.slice(0, 1);

  const depth = new Map<string, number>();
  const queue: Array<[string, number]> = roots.map((a) => [a, 0]);
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const [arc, d] = item;
    const prev = depth.get(arc);
    if (prev !== undefined && prev <= d) continue;
    depth.set(arc, d);
    for (const e of outs.get(arc) ?? []) queue.push([e.to, d + 1]);
  }
  // Арки, недостижимые от стартовых (изолированный остров) — уровень 0.
  for (const a of arcs) if (!depth.has(a)) depth.set(a, 0);

  const maxDepth = Math.max(0, ...depth.values());
  const levels: string[][] = Array.from({ length: maxDepth + 1 }, () => [] as string[]);
  for (const a of arcs) levels[depth.get(a) ?? 0].push(a);

  return { arcs, edges, roots, depth, levels };
}

/**
 * Собирает модель из текстов .rpy-файлов игры (порядок = порядок файлов).
 *
 * `arcOf` — правило «лейбл → арка»; по умолчанию — реальные правила игры
 * из potgen (те же, что в POT). Тесты подменяют своё детерминированное
 * правило, чтобы не зависеть от таблиц ARC_BY_*.
 */
export function buildModel(
  sources: readonly RpySource[],
  arcOf: (label: string) => string | undefined = arcOfLabel,
): BranchingModel {
  const parsed = sources.map((s) => ({ path: s.path, ...parseRpy(s.text) }));

  // Все определённые label (для фильтра фейковых целей) + их арки.
  // Файл-владелец лейбла решает: галерея/реплеи арки не несут (как в POT).
  const definedLabels = new Set<string>();
  const labelArc = new Map<string, string | undefined>();
  const labelOrder: string[] = [];
  for (const file of parsed) {
    const noArc = NO_ARC_FILES.test(file.path);
    for (const label of file.labels) {
      definedLabels.add(label);
      if (labelArc.has(label)) continue;
      labelArc.set(label, noArc ? undefined : arcOf(label));
      labelOrder.push(label);
    }
  }

  const arcOfForLabel = (label: string): string | undefined => labelArc.get(label);
  const allJumps = parsed.flatMap((f) => f.jumps);
  const edges = toArcEdges(allJumps, arcOfForLabel, definedLabels);
  const arcs = arcOrder(labelOrder, arcOfForLabel);
  return buildLevels(arcs, edges);
}

/** Читает реальные .rpy файлы игры (мимо tl/mods/renpy) и строит модель. */
export function loadModel(): BranchingModel {
  if (!existsSync(GAME)) throw new Error(`нет папки игры ${GAME} — задай TSSR_GAME`);
  const files = collectRpyFiles(GAME);
  if (files.length === 0) throw new Error(`в ${GAME} не найдено ни одного .rpy`);
  const sources: RpySource[] = files.map((path) => ({ path, text: readFileSync(path, "utf8") }));
  const model = buildModel(sources);
  // Счётчик строк — из POT: это дедуп по uid, т.е. ровно объём реальной
  // озвучки (в .rpy дубли реплик и многострочные строки считать нет смысла).
  if (existsSync(POT_PATH)) model.lines = countArcLines(readFileSync(POT_PATH, "utf8"));
  return model;
}

/** Валидный идентификатор state-узла (арки могут содержать не только \w). */
function stateId(arc: string, index: number): string {
  const cleaned = arc.replace(/[^A-Za-z0-9_]/g, "_");
  if (cleaned === "") return `A${index}`;
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `A_${cleaned}`;
}

/**
 * Сколько озвучиваемых строк в каждой арке — по POT (uid-каталог с дедупом:
 * это ровно то, что реально озвучивается; потген считает из того же скана
 * игры). Считаются только реплики (`msgctxt "speaker:*"` = диалог+наррация),
 * меню/UI не озвучиваются — они в POT с другими контекстами и не попадают.
 *
 * Формат POT: блок `#. arc: X` … `msgctxt "speaker:…"` / `msgid "…"`.
 * Блок без `#. arc:` (вне label) — в счёт не идёт; пустой msgid — заголовок.
 */
export function countArcLines(potText: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const block of potText.split(/\r?\n\r?\n/)) {
    const arc = /^#\. arc:\s*(.+)$/m.exec(block)?.[1]?.trim();
    if (!arc) continue; // вне label — арки нет
    if (!/^msgctxt "speaker:/m.test(block)) continue; // меню/ui — не реплика
    if (!/^msgid ".+"/m.test(block)) continue; // пустой msgid — заголовок
    counts.set(arc, (counts.get(arc) ?? 0) + 1);
  }
  return counts;
}

/**
 * Рендерит state diagram. Выбор нотации не случаен: activity-beta
 * (label/goto) в jebbs.plantuml падает с Syntax Error, а state работает
 * везде (проверено на plantuml.com, 2026-10-29).
 */
export function renderPuml(model: BranchingModel): string {
  const { arcs, edges, roots, depth, levels } = model;
  const id = new Map(arcs.map((a, i) => [a, stateId(a, i)]));

  const outs = new Map<string, ArcEdge[]>(arcs.map((a) => [a, []]));
  for (const e of edges) {
    const list = outs.get(e.from);
    if (list) list.push(e);
  }

  const p: string[] = [];
  p.push("@startuml");
  p.push("title TSSR — архитектура ветвления арок (game/*.rpy)");
  p.push("' единственный источник: jump/call между label в .rpy игры; уровни = BFS-глубина от старта");
  p.push("top to bottom direction");
  p.push("skinparam linetype polyline");
  p.push("skinparam nodesep 24");
  p.push("skinparam ranksep 70");
  p.push("skinparam defaultTextAlignment center");
  p.push("skinparam stateFontSize 12");
  p.push("skinparam stateFontStyle bold");
  p.push("skinparam arrowFontSize 10");
  p.push("skinparam ArrowColor #334155");
  p.push("skinparam packageBorderColor #94a3b8");
  p.push("skinparam packageBackgroundColor #f1f5f9");
  p.push("skinparam packageFontStyle bold");
  p.push("");
  p.push('state "СТАРТ" as START #e2e8f0');
  p.push("");

  // Уровни — composite state, НЕ package: package в state-режиме падает
  // с Syntax Error (проверено на plantuml.com 2026-10-29), а
  // state "Имя" as ID { ... } работает и группирует, и даёт рамку уровня.
  for (const [i, level] of levels.entries()) {
    p.push(`state "Уровень ${i}" as LEVEL${i} {`);
    for (const a of level) {
      const n = model.lines?.get(a);
      // счётчик строк под именем арки (state : описание) — «что озвучивать»
      p.push(`  state "${a}" as ${id.get(a)}${n !== undefined ? ` : ${n} строк` : ""}`);
    }
    p.push("}");
    p.push("");
  }

  for (const r of roots) p.push(`START --> ${id.get(r)}`);

  p.push("");
  const backEdges: string[] = [];
  for (const a of arcs) {
    const list = outs.get(a) ?? [];
    if (list.length === 0) continue;
    const multi = list.length > 1;
    for (const e of list) {
      const back = (depth.get(e.to) ?? 0) <= (depth.get(a) ?? 0);
      if (back) {
        // Обратные переходы НЕ рисуем: 20 пунктирных «всё возвращается в
        // Other» превращают диаграмму в жгут неразличимых линий (проверено
        // визуально 2026-10-29). Переносим их текстом в легенду — и
        // читаемость, и полнота.
        backEdges.push(`${a} -> ${e.to} (${e.weight})`);
        continue;
      }
      const label = multi ? ` : ${e.weight}` : "";
      p.push(`${id.get(a)} --> ${id.get(e.to)}${label}`);
    }
  }

  const totalWeight = edges.reduce((s, e) => s + e.weight, 0);
  p.push("");
  p.push("legend bottom");
  p.push(`  ${arcs.length} арок · ${edges.length} переходов · ${levels.length} уровней`);
  if (model.lines) {
    const totalLines = [...model.lines.values()].reduce((s, n) => s + n, 0);
    p.push(`  Озвучиваемых строк: ${totalLines} (по арке под её именем; диалог+наррация)`);
  }
  p.push(`  Переходов label->label между арками: ${totalWeight}`);
  p.push("  Стрелка = переход вперёд (на следующий уровень), N — сколько jump/call");
  p.push(`  Возвраты/петли (${backEdges.length}, не нарисованы):`);
  for (const b of backEdges) p.push(`    ${b}`);
  p.push("endlegend");
  p.push("@enduml");
  return p.join("\n") + "\n";
}

function main(argv: string[]): void {
  const outFlag = argv.indexOf("--out");
  const outPath = outFlag >= 0 ? (argv[outFlag + 1] ?? DEFAULT_OUT) : DEFAULT_OUT;
  try {
    const model = loadModel();
    writeFileSync(outPath, renderPuml(model), "utf8");
    const weights = model.edges.reduce((s, e) => s + e.weight, 0);
    console.log(
      `ok: ${outPath}\nарок ${model.arcs.length}, переходов между арками ${model.edges.length} ` +
        `(label-переходов ${weights}), уровней ${model.levels.length}`,
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
