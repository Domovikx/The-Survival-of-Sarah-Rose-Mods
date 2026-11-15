import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Страж архитектуры сайта (Feature-Sliced Design).
 *
 * Правила, которые типом не проверить:
 *   1) слои тянутся только вниз: app > widgets > features > shared;
 *   2) слайсы одного слоя не знают друг о друге (features/widgets/app);
 *   3) чужой слайс импортируется только через public API (`index.ts`);
 *   4) в графе импортов нет циклов.
 *
 * Тест статический (читает исходники), как и structure.spec.ts.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const LAYERS = ["shared", "features", "widgets", "app"] as const;
type Layer = (typeof LAYERS)[number];
const rank = (layer: Layer): number => LAYERS.indexOf(layer);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });

const FILES = walk(SRC);
const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/** Разрешает спецификатор импорта в файл проекта (внешние пакеты — null). */
const resolveSpec = (importer: string, spec: string): string | null => {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(importer), spec);
  else return null;

  return [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")].find(isFile) ?? null;
};

/** Слой и слайс файла: shared/config/x.ts -> [shared, config]; widgets/hero/ui/A.tsx -> [widgets, hero]. */
const sliceOf = (path: string): { layer: Layer; slice: string } | null => {
  const parts = relative(SRC, path).split(/[\\/]/);
  const layer = parts[0] as Layer;
  if (!LAYERS.includes(layer)) return null;
  if (layer === "app") return { layer, slice: "app" };
  return { layer, slice: parts[1] ?? "" };
};

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;

type Edge = {
  importer: string;
  spec: string;
  target: string;
  own: { layer: Layer; slice: string };
  other: { layer: Layer; slice: string };
};

const EDGES: Edge[] = [];
for (const importer of FILES) {
  const text = readFileSync(importer, "utf-8");
  const own = sliceOf(importer);
  for (const match of text.matchAll(IMPORT_RE)) {
    const spec = match[1]!;
    const target = resolveSpec(importer, spec);
    if (!target) continue;
    const other = sliceOf(target);
    if (!own || !other) continue;
    EDGES.push({ importer, spec, target, own, other });
  }
}

const where = (edge: Edge): string => `${relative(SRC, edge.importer)} -> ${edge.spec}`;

test.describe("архитектура (FSD): слои, public API, циклы", () => {
  test("слои тянутся только вниз: app > widgets > features > shared", () => {
    const up = EDGES.filter((edge) => rank(edge.other.layer) > rank(edge.own.layer)).map(where);
    expect(up, "импорт «вверх» по слоям запрещён").toEqual([]);
  });

  test("слайсы одного слоя не импортируют друг друга", () => {
    const sideways = EDGES.filter(
      (edge) =>
        edge.own.layer === edge.other.layer && edge.own.slice !== edge.other.slice && edge.own.layer !== "shared",
    ).map((edge) => `${where(edge)} (${edge.own.slice} -> ${edge.other.slice})`);
    expect(sideways, "связь слайсов — через app или нижележащий слой").toEqual([]);
  });

  test("чужой слайс — только через public API (index.ts)", () => {
    const violations: string[] = [];
    for (const edge of EDGES) {
      const crossSlice = edge.own.layer !== edge.other.layer || edge.own.slice !== edge.other.slice;
      if (!crossSlice) continue;

      const sliceRoot = join(SRC, edge.other.layer, edge.other.slice);
      const isPublicApi = /index\.tsx?$/.test(edge.target);
      if (!isPublicApi) violations.push(where(edge));
      expect(edge.target.startsWith(sliceRoot), `импорт вне слайса: ${where(edge)}`).toBe(true);
    }
    expect(violations, "импорт мимо index.ts: добавь экспорт в public API слайса").toEqual([]);
  });

  test("у каждого слайса features/widgets есть public API (index.ts)", () => {
    const slices = new Set<string>();
    for (const file of FILES) {
      const own = sliceOf(file);
      if (own && (own.layer === "features" || own.layer === "widgets")) slices.add(join(SRC, own.layer, own.slice));
    }
    const missing = [...slices].filter(
      (slice) => !isFile(join(slice, "index.ts")) && !isFile(join(slice, "index.tsx")),
    );
    expect(
      missing.map((slice) => relative(SRC, slice)),
      "нет index.ts — слайс закрыт для внешнего мира",
    ).toEqual([]);
  });

  test("в графе импортов нет циклов", () => {
    const graph = new Map<string, string[]>();
    for (const edge of EDGES) {
      graph.set(edge.importer, [...(graph.get(edge.importer) ?? []), edge.target]);
    }

    const state = new Map<string, "open" | "done">();
    const stack: string[] = [];
    const cycles: string[] = [];
    const visit = (file: string): void => {
      if (state.get(file) === "done") return;
      if (state.get(file) === "open") {
        const start = stack.indexOf(file);
        cycles.push([...stack.slice(start), file].map((path) => relative(SRC, path)).join(" -> "));
        return;
      }
      state.set(file, "open");
      stack.push(file);
      for (const next of graph.get(file) ?? []) if (graph.has(next)) visit(next);
      stack.pop();
      state.set(file, "done");
    };
    for (const file of FILES) visit(file);

    expect(cycles, "циклические импорты ломают HMR и порядок инициализации").toEqual([]);
  });
});
