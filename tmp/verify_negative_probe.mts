/**
 * tmp/verify_negative_probe.mts — ОБРАТНЫЙ тест контура judgeVerified:
 * обязан ли он ОТКЛОНЯТЬ заведомо бракованные переводы.
 *
 * Если брак проходит — авто-принятие опасно для качества и контур надо править.
 *
 * Запуск: node tmp/verify_negative_probe.mts
 */
import { readFileSync } from "node:fs";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { judgeVerified } from "../.opencode/skills/renpy-po/po_translate.mts";

const BASE = "http://127.0.0.1:1234";
const MODEL = "qwen/qwen3.5-9b";
const THRESHOLD = 9;

const es = parsePo(readFileSync("patches/ai-voice-pack/po/es.po", "utf-8").replace(/\r\n/g, "\n")).filter(
  (e) => e.msgid,
);

/** Битые варианты: каждый нарушает конкретное правило/смысл. */
const CASES: Array<{ frag: string; bad: string; why: string }> = [
  {
    frag: "Sarah still felt every part of her being controlled",
    bad: "Sarah seguía sintiendo que la controlaban, el pelo tirado con fuerza, el coño expuesto y con él entrando en ella.",
    why: "ВТОРАЯ ФРАЗА ВЫБРОШЕНА («Holding onto the wall...») — потеря содержания",
  },
  {
    frag: "Her belly expanded, her ankles swole up",
    bad: "Su vientre se hinchó, los tobillos se hincharon y sentía náuseas matutinas. Elle se sentait mal au matin.",
    why: "ФРАНЦУЗСКИЙ ХВОСТ — утечка языка",
  },
  {
    frag: "Sarah moaned out louder at the sudden penetration",
    bad: "Sarah se durmió tranquilamente mientras leía un libro de recetas.",
    why: "СМЫСЛОВОЙ БРЕД — не соответствует источнику вообще",
  },
  {
    frag: "She swallowed more of it, gulping each time he added",
    bad: "Se tragó más, haciendo un trago cada vez que él seguía añadiendo. Ella sintió la penetración profunda y el semen.",
    why: "ДОБАВЛЕНА СОДЕРЖАТЕЛЬНАЯ КОНТЕКСТУРА (penetración = FORBIDDEN-термин)",
  },
  {
    frag: "Just enough to get her clit onto his upper thigh",
    bad: "Justo lo necesario para apoyar su clítoris sobre la parte alta de su pierna. él era un hombre alto.",
    why: "МАКСИМАЛЬНО БЛИЗКИЙ к принятому, но с лишним предложением",
  },
  {
    frag: "Her belly expanded, her ankles swole up",
    // реальный дефект рода/смысла: morning sickness у Sarah (жен.), «он страдал»
    bad: "Su vientre se hinchó, los tobillos se hincharon y él padecía las náuseas matutinas.",
    why: "ПОДМЕНА СУБЪЕКТА: «elle» -> «él» (Sarah больше не страдает)",
  },
];

let rejected = 0;
for (const c of CASES) {
  const e = es.find((x) => x.msgid.includes(c.frag));
  if (!e) {
    console.log(`?? не найдено: ${c.frag}`);
    continue;
  }
  const v = await judgeVerified(BASE, MODEL, "es", e, c.bad, null, THRESHOLD);
  const ok = v.score < THRESHOLD;
  if (ok) rejected++;
  console.log(`${ok ? "ОТКЛОНЕНО " : "!!! ПРОШЁЛ  "} ${v.score}/10  ${c.why}`);
  for (const i of v.issues.slice(0, 3)) console.log(`        - ${i}`);
}
console.log(`\nИТОГ: отклонено ${rejected}/${CASES.length} (ожидаем ${CASES.length}/${CASES.length})`);
