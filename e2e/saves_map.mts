/**
 * saves_map.mts — карта сейвов: какой сейв = какая сцена (для быстрых E2E-прогонов).
 * Ren'Py save = ZIP (screenshot.png, log, extra, json...); сцена/label ищется
 * в распакованных записях по именам сцен из POT.
 * Запуск: node tmp/saves_map.mts
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.env.APPDATA ?? "", "RenPy", "TheSurvivalofSarahRose-1625513096");
const SCENES = [
  "OpeningScene",
  "OpeningSceneSequence2",
  "OpeningSceneEvening",
  "OpeningSceneFirstMorning",
  "DayOfTheFuneral",
  "MeetingOnTheBattlements",
  "MeetingKateInTheGarden",
  "SecondPartOfFuneral",
  "SarahsBedroomAfterFuneral",
  "TheMorningAfterKate",
  "CoronationDay",
  "ChooseThePath",
  "TheInsidePathBegins",
  "start",
];
for (const f of readdirSync(DIR)
  .filter((x) => x.endsWith(".save"))
  .toSorted()) {
  const p = join(DIR, f);
  let txt = "";
  try {
    txt = execFileSync("unzip", ["-p", p], { encoding: "latin1", maxBuffer: 1 << 26 });
  } catch {
    /* не распаковался — пропуск */
  }
  const hits = [...new Set(SCENES.filter((s) => txt.includes(s)))];
  const mtime = statSync(p).mtime.toISOString().slice(0, 16);
  console.log(`${f.padEnd(24)} ${mtime}  сцены: ${hits.join(",") || "—"}`);
}
