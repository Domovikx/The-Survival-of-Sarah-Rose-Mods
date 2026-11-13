/** tmp/tone_probe3.mts — промпт D2: минимальная правка + регистр ОРИГИНАЛА + имена. */
import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

const RE_CLIN = [
  /(?<![\p{L}])полов(?:ые|ых|ым|ыми|ой|ого|ому|ая|ое)\s+орган/iu,
  /(?<![\p{L}])полов(?:ой|ым|ого|ые|ых|ая|ое)\s+(?:акт|сношени|связ|член|возбуждени)/iu,
  /(?<![\p{L}])влагалищ/iu,
  /(?<![\p{L}])вагин/iu,
  /(?<![\p{L}])пенис/iu,
  /(?<![\p{L}])фаллос/iu,
  /(?<![\p{L}])эрекц/iu,
  /(?<![\p{L}])эякуля/iu,
  /(?<![\p{L}])семяизвержени/iu,
  /(?<![\p{L}])копуляц/iu,
  /(?<![\p{L}])совокуплени/iu,
  /(?<![\p{L}])мастурбац/iu,
  /(?<![\p{L}])онанизм/iu,
  /(?<![\p{L}])клитор/iu,
  /(?<![\p{L}])анус(?:а|у|ом|е|ы|ов|ам|ами|ах)?(?![\p{L}])/iu,
  /(?<![\p{L}])промежност/iu,
  /(?<![\p{L}])генитал/iu,
  /(?<![\p{L}])мошонк/iu,
  /(?<![\p{L}])яичник/iu,
  /(?<![\p{L}])оральн(?:ый|ого|ым|ом|ая|ой|ую|ые|ых)\s+секс/iu,
  /(?<![\p{L}])анальн(?:ый|ого|ым|ом|ая|ой|ую|ые|ых)\s+секс/iu,
  /(?<![\p{L}])матк(?:а|и|у|ой|е|ам|ами|ах)(?![\p{L}])/iu,
];

const SYS = `You are a Russian literary editor of 18+ erotic prose. You receive ONE source line (English) and its Russian translation. The translation is accurate, but some wording sounds clinical (medical, anatomical, or like a label) instead of literary.

Task: minimal edit. Replace ONLY the clinical/labelling wording with the wording a Russian author of erotic prose would use in that exact situation. Keep everything else untouched: same facts, same beats, same point of view, same grammatical gender, same character names, same punctuation.

Register comes from the ENGLISH source, not from the existing translation:
- the English uses a neutral or literary euphemism ("her sex", "between her legs", "womanhood") -> the Russian must stay equally neutral/literary, no slang and no crude words;
- the English is crude ("pussy", "cock", "ass", "cunt") -> the Russian is just as crude;
- never more explicit, never more modest than the source.

Rules:
- Do NOT add new images, metaphors, details or sensations that the source does not have.
- Do NOT invent words, do NOT use rare or bookish substitutes that a normal reader would not use.
- Do NOT change which body part is meant, and do NOT replace a character's name with a pronoun.
- If the Russian line has no clinical wording, return it unchanged.

Output ONLY the resulting Russian line, nothing else.`;

type C = { tag: string; en: string; ru: string };
const fromPo = (pred: (en: string, ru: string) => boolean, n: number): C[] => {
  const e = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((x) => x.msgid);
  return e
    .filter((x) => pred(x.msgid, x.msgstr))
    .slice(0, n)
    .map((x, i) => ({ tag: `po-${i}`, en: x.msgid, ru: x.msgstr }));
};
const real = fromPo(
  (en, ru) =>
    (/her sex|his cock|her pussy|between .{0,12}legs|her clit|oral sex|her ass/i.test(en) || ru.includes("половы") || ru.includes("влагалищ") || ru.includes("клитор") || ru.includes("промежност")) &&
    ru.length < 300,
  12,
);
const CASES: C[] = [
  ...real,
  { tag: "CTRL-soft", en: "Sarah felt her heart race as he stepped closer.", ru: "Сердце Сары забилось чаще, когда он шагнул ближе." },
  { tag: "CTRL-metaphor", en: "He looked at her with a tired, knowing smile.", ru: "Он посмотрел на неё с усталой, понимающей улыбкой." },
];

const chat = async (user: string, temp: number): Promise<string> => {
  const r = await fetch("http://127.0.0.1:8080/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen3.6-35b-a3b-ud-q4_k_xl",
      messages: [{ role: "system", content: SYS }, { role: "user", content: user }],
      temperature: temp, max_tokens: 320, stream: false, reasoning_effort: "none",
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (d.choices?.[0]?.message?.content ?? "").trim().replace(/^"|"$/g, "");
};

/** Имена: слова с заглавной НЕ в начале предложения — должны сохраниться. */
const names = (s: string): string[] => {
  const out: string[] = [];
  for (const m of s.matchAll(/(?<!^)(?<![.!?—]\s)(?<![.!?])(?<!^)(\p{Lu}[\p{L}'-]{2,})/gu)) {
    const w = m[1];
    if (!/^(Я|Он|Она|Они|Оно|Но|И|А|Его|Её|Их|Это|Тот|Та|То|Когда|Если|Что|Как|В|На|С|К|У|По|За|Из|От|До|Не|Ни|Всё|Все|Однако|Потом|Затем)$/.test(w)) out.push(w);
  }
  return [...new Set(out)];
};

let ok = 0, bad = 0;
for (const c of CASES) {
  const out = await chat(`SOURCE (en): ${c.en}\nTRANSLATION (ru): ${c.ru}`, 0);
  const clin = RE_CLIN.filter((re) => re.test(out)).map((re) => re.source.slice(0, 18));
  const latin = /[A-Za-z]{2,}/.test(out) ? "ЛАТИНИЦА" : "";
  const lost = names(c.ru).filter((n) => !out.includes(n));
  const ratio = out.length / Math.max(1, c.ru.length);
  const flags = [clin.length ? `КЛИНИКА(${clin.join(",")})` : "", latin, lost.length ? `ИМЯ-${lost.join(",")}` : "", ratio < 0.75 || ratio > 1.4 ? `LEN×${ratio.toFixed(2)}` : ""].filter(Boolean);
  if (flags.length) bad++; else ok++;
  console.log(`### ${c.tag}  ${flags.length ? "✗ " + flags.join(" | ") : "✓"}`);
  console.log(`  EN: ${c.en}\n  было: ${c.ru}\n  стало: ${out}\n`);
}
console.log(`итог: ✓ ${ok} / ✗ ${bad}`);
