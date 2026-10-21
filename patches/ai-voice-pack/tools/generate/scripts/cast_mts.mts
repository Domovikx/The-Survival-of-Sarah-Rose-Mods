/**
 * Генератор типизированных констант кастов: casts/{Name}.yaml -> {Name}.mts.
 *
 * Образец: casts/Xanthippe/Xanthippe.mts — `export const Имя: CastContract = {...}`
 * (контракт — casts/cast.types.mts). Контрактные поля переносятся все
 * (name, gender, age, who, instruct_en, instruct_ru, texts); arcs и who_codes
 * в TS-сторону НЕ переносятся (арки есть в каталоге, who_codes — легаси
 * python-пайплайна). Yaml остаётся источником пайплайна, mts — типизированная
 * копия.
 *
 * Тем же прогоном пишется voices.mts (в casts/voices/) — список войсов
 * (папки casts/ с контрактом {Name}.yaml) + тип Voice: производная от
 * файловой системы, как po/template.speakers.mts — от POT. Рукописная мапа
 * «спикер → голос» живёт в casts/casts.mts: ключи — PotSpeaker (голоса игры),
 * значения — Voice (раскидка вручную).
 *
 * Имя экспорта = имя каста без пробелов/знаков: "Captain Belmont" ->
 * CaptainBelmont (коллизии проверяются; каноническое имя всегда в поле name).
 *
 * Запуск:
 *   node cast_mts.mts              # все касты (+ voices.mts)
 *   node cast_mts.mts --only Sarah # один каст (cast_names.mts не трогается)
 * Формат — prettier-конфиг репы (API), поэтому прогон идемпотентен.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import prettier from "prettier";
import { parse as parseYaml } from "yaml";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = join(SCRIPTS_DIR, "..", "..", "..");
export const DEFAULT_CASTS = join(PKG_ROOT, "casts", "voices");

/** Порядок полей как в образце (в yaml порядок другой — канонический тут). */
export const FIELDS = ["name", "gender", "age", "who", "instruct_en", "instruct_ru", "texts"] as const;
const STR_FIELDS = FIELDS.slice(0, -1);
const DEFAULTS: Record<string, string> = {
  gender: "?",
  age: "?",
  who: "",
  instruct_en: "",
  instruct_ru: "",
};
const EMOTION_KEYS = ["text", "emotion_en", "emotion_ru"];

/** Имя экспорта TS: "Captain Belmont" -> CaptainBelmont. */
export function castIdent(name: string): string {
  const ident = (name ?? "").replace(/[^A-Za-z0-9_$]/g, "");
  if (!ident) throw new Error(`не удалось вывести имя экспорта из ${JSON.stringify(name)}`);
  return ident;
}

/** Значение -> JS-литерал (JSON — валидный JS, кириллица не эскейпится). */
export function js(value: unknown): string {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    // канонический порядок ключей пофразовой эмоции (voice_design.text_item)
    const src = value as Record<string, unknown>;
    const canon: Record<string, unknown> = {};
    for (const k of EMOTION_KEYS) if (k in src) canon[k] = src[k];
    for (const k of Object.keys(src).sort()) if (!EMOTION_KEYS.includes(k)) canon[k] = src[k];
    value = canon;
  }
  return JSON.stringify(value);
}

function bad(source: string, problems: string[]): never {
  throw new Error(`${source}: ${problems.join("; ")}`);
}

/** dict из yaml -> текст {Name}.mts. Кидает Error при кривых данных. */
export function renderMts(data: unknown, source: string): string {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    bad(source, ["не объект"]);
  }
  const d = data as Record<string, unknown>;
  const problems: string[] = [];
  for (const key of STR_FIELDS) {
    if (key in d && d[key] != null && typeof d[key] !== "string") {
      problems.push(`${key}: ожидалась строка`);
    }
  }
  const texts = d.texts ?? [];
  if (!Array.isArray(texts)) {
    problems.push("texts: ожидался список");
  } else {
    texts.forEach((item, i) => {
      const ok =
        typeof item === "string" ||
        (typeof item === "object" &&
          item !== null &&
          typeof (item as Record<string, unknown>).text === "string" &&
          Object.values(item).every((v) => typeof v === "string"));
      if (!ok) problems.push(`texts[${i}]: строка или запись {text, emotion_en, emotion_ru}`);
    });
  }
  const name = d.name;
  if (typeof name !== "string" || !name) problems.push("name: нужна непустая строка");
  if (problems.length) bad(source, problems);

  const out: string[] = [
    `import type { CastContract } from "../../cast.types.mts";`,
    "",
    `export const ${castIdent(name as string)}: CastContract = {`,
  ];
  for (const key of STR_FIELDS) {
    out.push(`  ${key}: ${js((d[key] as string) || DEFAULTS[key])},`);
  }
  out.push("  texts: [");
  for (const t of texts as unknown[]) out.push(`    ${js(t)},`);
  out.push("  ],");
  out.push("};");
  out.push("");
  return out.join("\n");
}

/** Касты = папки с контрактом {Name}.yaml. */
export function listCasts(castsDir: string, only?: string | null): string[] {
  let dirs: string[];
  try {
    dirs = readdirSync(castsDir).sort();
  } catch {
    return [];
  }
  return dirs.filter((d) => {
    if (only) return d === only;
    return existsSync(join(castsDir, d, `${d}.yaml`));
  });
}

export interface GenerateResult {
  total: number;
  changed: string[];
  errors: string[];
}

/** Генерация всех кастов (или одного --only). Файлы в формате prettier репы. */
export async function generate(opts: { castsDir?: string; only?: string | null } = {}): Promise<GenerateResult> {
  const castsDir = opts.castsDir ?? DEFAULT_CASTS;
  const pairs = listCasts(castsDir, opts.only);
  const result: GenerateResult = { total: 0, changed: [], errors: [] };
  if (!pairs.length) {
    result.errors.push("касты не найдены");
    return result;
  }

  const idents = new Map<string, string>();
  for (const name of pairs) {
    const ypath = join(castsDir, name, `${name}.yaml`);
    const mpath = join(castsDir, name, `${name}.mts`);
    let text: string;
    try {
      text = renderMts(parseYaml(readFileSync(ypath, "utf8")) ?? {}, `${name}.yaml`);
    } catch (e) {
      result.errors.push(`${name}: ${(e as Error).message}`);
      continue;
    }
    const ident = castIdent(name);
    if (idents.has(ident)) {
      result.errors.push(`${name}: коллизия экспорта с ${idents.get(ident)}`);
      continue;
    }
    idents.set(ident, name);

    const cfg = (await prettier.resolveConfig(mpath)) ?? {};
    const formatted = await prettier.format(text, { ...cfg, filepath: mpath });
    const old = existsSync(mpath) ? readFileSync(mpath, "utf8") : null;
    if (old !== formatted) writeFileSync(mpath, formatted, "utf8");
    result.total += 1;
    if (old !== formatted) result.changed.push(name);
  }
  return result;
}

async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { only: { type: "string" } },
  });
  const r = await generate({ only: values.only ?? null });
  for (const name of r.changed) console.log(`  + ${name}`);
  console.log(`${r.total} кастов, обновлено ${r.changed.length}, ошибок ${r.errors.length}`);
  for (const e of r.errors) console.error(`ОШИБКА: ${e}`);
  return r.errors.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)));
}
