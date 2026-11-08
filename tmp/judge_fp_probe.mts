/**
 * E2E-проба ФРАЗ-ложняков судьи: реальные ложные флаги ru-перепроверки
 * 2026-11-06 (ожидание: verdict=ok). Крутим промпт судьи, пока набор не
 * чист — хардкод-списков ACCEPTED вместо этого не оставляем.
 * Запуск: node tmp/judge_fp_probe.mts
 */
import { judgeLine } from "./judge_client.mts";

interface Case {
  i: number;
  en: string;
  tr: string;
  why: string;
}

const CASES: Case[] = [
  {
    i: 58985,
    en: "What do you think? Think it was my fault for not giving you enough dick?",
    tr: "Как думаешь? Считала, что я был виновен в том, что не давал тебе достаточно члена?",
    why: "род по адресату (Сара), не по спикеру (Аларик)",
  },
  {
    i: 47858,
    en: "You were so tough just a few hours ago. My cock make you forget how to talk back?",
    tr: "А куда делась та твоя бранность? Всё несколько часов назад ты была такой смелой. Неужели мой член заставил тебя забыть, как отвечать?",
    why: "род по адресату (Сара), спикер — Captain",
  },
  {
    i: 55328,
    en: "Or have you perhaps decided to begin your investigation yourself.",
    tr: "Или, может быть, ты решила начать своё исследование самостоятельно?",
    why: "адресат — Сара (Razaphel говорит)",
  },
  {
    i: 28985,
    en: "She cried out for nobody else to hear as she came.",
    tr: "Она вскрикнула, чтобы никто другой не услышал, как она кончает.",
    why: "«come» в эротической сцене = оргазм, не прибытие",
  },
  {
    i: 43744,
    en: "She reached up with one hand each, grabbing the shafts of the other guards.",
    tr: "Она протянула обе руки и схватила за стволы оружия других стражников.",
    why: "«one hand each» — кривой EN, обе руки = допустимо",
  },
  {
    i: 12550,
    en: "Ayaka, but you can just call me Aya, everbody does really.",
    tr: "Аяка, но можешь просто звать меня Ая — так ведь все и делают.",
    why: "короткая форма имени — не искажение",
  },
];

const TEMP = Number(process.env.JUDGE_TEMP ?? "0");
const VARIANT = process.env.JUDGE_VARIANT ?? "v10";
const VERIFY = process.env.JUDGE_VERIFY === "1";

let bad = 0;
for (const c of CASES) {
  const j = await judgeLine(c.en, c.tr, "ru", "", TEMP, VARIANT, VERIFY);
  const verdict = j ? j.v : "ERR";
  if (verdict !== "ok") bad++;
  console.log(`${verdict === "ok" ? "OK  " : "FAIL"} [${c.i}] ${verdict}${j && j.v === "bad" ? ` ← ${j.r}` : ""} | ${c.why}`);
}
console.log(`FP-проба: чисто ${CASES.length - bad}/${CASES.length}`);
process.exit(bad ? 1 : 0);
