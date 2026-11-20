/**
 * Порядок языков — из ЕДИНОГО источника: `config/language-priority.json`
 * (приказ владельца 2026-11-13: любой список языков в UI идёт в этом порядке).
 *
 * Скрипт генерирует `src/core/langs.generated.ts`; `npm run build` вызывает его
 * через `prebuild`, поэтому вшитый список не может разъехаться с конфигом.
 * Тест `src/core/langs.test.ts` дополнительно сверяет файл с конфигом.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const configPath = join(root, "..", "config", "language-priority.json");
const outPath = join(root, "src", "core", "langs.generated.ts");

type Entry = { rank: number; code: string };
const data = JSON.parse(readFileSync(configPath, "utf-8")) as {
  source?: string;
  updated?: string;
  languages: Entry[];
};

const codes = [...data.languages].sort((a, b) => a.rank - b.rank).map((l) => l.code);

const bad = codes.filter((c) => !/^[a-z]{2}$/.test(c));
if (bad.length) throw new Error(`некорректные коды языков: ${bad.join(", ")}`);
if (new Set(codes).size !== codes.length) throw new Error("дубли кодов в language-priority.json");

const banner = `/**
 * СГЕНЕРИРОВАНО — руками не править.
 *
 * Источник: \`config/language-priority.json\` (${data.source ?? "Steam HW Survey"}, ${data.updated ?? "—"}).
 * Перегенерация: \`npm run gen:langs\` (вызывается автоматически перед сборкой).
 */
`;

// Компактная запись (как JSON) — файл в `.prettierignore`: генерируемый
// артефакт не переформатируется, иначе после каждой сборки грязное дерево.
writeFileSync(outPath, `${banner}export const LANG_ORDER = ${JSON.stringify(codes)} as const;\n`, "utf-8");
console.log(`langs: ${codes.join(", ")} → ${outPath}`);
