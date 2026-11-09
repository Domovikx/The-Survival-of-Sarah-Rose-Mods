// Эмпирика порога длинной вклейки: длина общего фрагмента с соседом
// для РЕАЛЬНЫХ (3 из выборки393: 52770/22308/20333) и FP (8 верно переведённых).
// node tmp/runlen_probe.mts
import { readFileSync } from "node:fs";

import { parsePo } from "../../../.opencode/skills/renpy-po/po_core.mts";
import { commonRun, contentWords } from "./review_common_run.mts";

const entries = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid,
);

const cases: Array<[number, boolean, string]> = [
  [52770, true, "вклейка: TR содержит контент i+1"],
  [22308, true, "вклейка: хвост i+1 в TR"],
  [20333, true, "вклейка: контент i+1 в TR"],
  [23410, false, "верный перевод"],
  [7034, false, "верный"],
  [1642, false, "эхо «посмотрела на Томаса»"],
  [9813, false, "верный"],
  [54414, false, "параллелизм «Только до тех пор»"],
  [25370, false, "параллелизм EN endure/survive"],
  [8145, false, "верный"],
  [18495, false, "верный"],
  [3336, false, "эхо «Несмотря на всё это»"],
];

for (const [i, real, note] of cases) {
  const e = entries[i];
  const best = { run: "", words: 0, dir: "", content: 0 };
  for (const [dir, n] of [
    ["i+1", entries[i + 1]],
    ["i-1", entries[i - 1]],
  ] as const) {
    if (!n) continue;
    const run = commonRun(e.msgstr, n.msgstr);
    const words = run ? run.split(" ").length : 0;
    if (words > best.words) Object.assign(best, { run, words, dir, content: contentWords(run) });
  }
  console.log(
    `${real ? "REAL " : "FP   "} [${i}] run=${best.words} content=${best.content} dir=${best.dir} «${best.run.slice(0, 70)}» (${note})`,
  );
}
