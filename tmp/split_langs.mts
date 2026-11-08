// ВРЕМЕННЫЙ (повторный): атомизация po_langs.mts -> po_langs/{lang}.mts
// Контроль: системные промпты ДО/ПОСЛЕ обязаны совпасть байт-в-байт.
// Отступы: убираем РОВНО 4 (уровень полей объекта) только у строк СНАРУЖИ
// шаблонов; строки внутри `rules: \`...\`` не трогаем — там отступ = контент.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DIR = ".opencode/skills/renpy-po";
// оригинал из HEAD + наша правка ключа JSON (es -> tr)
let src = readFileSync("tmp/po_langs_head.mts", "utf-8");
src = src.replace(
  `- Output STRICT JSON only: {"es":"<translation>"}. The key is always "es" regardless of target language. No commentary.`,
  `- Output STRICT JSON only: {"tr":"<translation>"}. The key is always "tr" (it is NOT a language hint — it just means "translation"). No commentary.`,
);
if (!src.includes('"tr":"<translation>"')) throw new Error("правка ключа не применилась");

const commonStart = src.indexOf("const COMMON = `");
const langsStart = src.indexOf("export const LANGS", commonStart);
const commonBlock = src.slice(commonStart, langsStart).trimEnd();

const langsBody = src.slice(src.indexOf("{", langsStart) + 1, src.indexOf("\n};", langsStart));

const marks: Array<{ code: string; at: number }> = [];
const re = /^  ([a-z]{2}): \{$/gm;
let m: RegExpExecArray | null;
while ((m = re.exec(langsBody)) !== null) marks.push({ code: m[1], at: m.index });
console.log("профилей:", marks.map((x) => x.code).join(", "));

mkdirSync(join(DIR, "po_langs"), { recursive: true });

/** Правка отступов: -4 пробела только для строк вне шаблонов. */
function dedentProfile(body: string): string {
  const out: string[] = [];
  let inTemplate = false;
  for (const line of body.split("\n")) {
    if (!inTemplate && /^ {4,}\S/.test(line)) {
      out.push(line.slice(4));
      // строка могла ОТКРЫТЬ шаблон
      const backticks = (line.match(/`/g) ?? []).length;
      if (backticks % 2 === 1) inTemplate = true;
      continue;
    }
    out.push(line);
    const backticks = (line.match(/`/g) ?? []).length;
    if (backticks % 2 === 1) inTemplate = !inTemplate;
  }
  return out.join("\n");
}

for (let i = 0; i < marks.length; i++) {
  const start = marks[i].at;
  const end = i + 1 < marks.length ? marks[i + 1].at : langsBody.length;
  const code = marks[i].code;
  let chunk = langsBody.slice(start, end);
  // срезаем "  code: {" и закрывающее "  }," / "  }"
  const openEnd = chunk.indexOf("\n");
  let inner = chunk.slice(openEnd + 1);
  inner = inner.replace(/\n {2}\},?\s*$/, "\n");
  inner = dedentProfile(inner);
  const file = `import type { LangProfile } from "./common.mts";
import { COMMON, EROTIC_NOTE } from "./common.mts";

export const profile: LangProfile = {
${inner}
};
`;
  writeFileSync(join(DIR, "po_langs", `${code}.mts`), file, "utf-8");
}

const typeStart = src.indexOf("export interface LangProfile");
const typeEnd = src.indexOf("\n/** Базовые правила");
writeFileSync(
  join(DIR, "po_langs", "common.mts"),
  `/** Общие типы и базовые правила всех языковых профилей po:translate. */
${src.slice(typeStart, typeEnd).trimEnd()}

${commonBlock.replace(/^const COMMON/m, "export const COMMON").replace(/^const EROTIC_NOTE/m, "export const EROTIC_NOTE")}
`,
  "utf-8",
);

const codes = marks.map((x) => x.code);
writeFileSync(
  join(DIR, "po_langs", "index.mts"),
  `/**
 * po_langs/index.mts — сборка языковых профилей.
 * Атомизация 2026-10-26: каждый язык в своём файле (своя специфика:
 * морфология, формы обращения, few-shot) без правок соседних языков.
 */
import type { LangProfile } from "./common.mts";
${codes.map((c) => `import { profile as ${c} } from "./${c}.mts";`).join("\n")}

export type { LangProfile } from "./common.mts";

export const LANGS: Record<string, LangProfile> = {
${codes.map((c) => `  ${c},`).join("\n")}
};

export function langProfile(code: string): LangProfile {
  const p = LANGS[code];
  if (p) return p;
  throw new Error(
    \`Неизвестный язык "\${code}". Доступные: \${Object.keys(LANGS).join(", ")}. Профиль: po_langs/<code>.mts\`,
  );
}
`,
  "utf-8",
);

writeFileSync(
  join(DIR, "po_langs.mts"),
  `/**
 * po_langs.mts — точка входа языковых профилей (тонкий re-export).
 * Профили атомизированы 2026-10-26: po_langs/<code>.mts — по файлу на язык.
 */
export { LANGS, langProfile } from "./po_langs/index.mts";
export type { LangProfile } from "./po_langs/index.mts";
`,
  "utf-8",
);
console.log("готово");
