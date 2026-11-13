/**
 * flags_report.mts — сводка флагов судьи из tmp/judge_<lang>.log.
 * Печатает: сколько строк судили, сколько bad, и по каждому флагу индекс+причину.
 */
import { readdirSync, readFileSync } from "node:fs";

// Список языков — из самих логов (что прогнали, то и сводим): без ручного
// массива, который расходится с реальностью.
const LANGS = readdirSync("tmp")
  .map((f) => /^judge_([a-z]{2})\.log$/u.exec(f)?.[1])
  .filter((l): l is string => Boolean(l))
  .sort();
let grand = 0;

for (const lang of LANGS) {
  const p = `tmp/judge_${lang}.log`;
  const lines = readFileSync(p, "utf-8").split(/\r?\n/u);
  const total = lines
    .map((l) => /строк к суду: (\d+)/u.exec(l)?.[1] ?? "")
    .filter(Boolean)
    .reduce((s, n) => s + Number(n), 0);
  const flags = lines.filter((l) => l.startsWith("СУДЬЯ-BAD"));
  grand += flags.length;
  const fail = lines
    .map((l) => /не разобрано (\d+)/u.exec(l)?.[1] ?? "")
    .filter(Boolean)
    .reduce((s, n) => s + Number(n), 0);
  console.log(`\n===== ${lang}: судили ${total}, флагов ${flags.length}${fail ? `, не разобрано ${fail}` : ""}`);
  for (const f of flags) console.log("  " + f.replace(/^СУДЬЯ-BAD /u, ""));
}
console.log(`\nВСЕГО флагов: ${grand}`);
