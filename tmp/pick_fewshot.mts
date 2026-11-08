// Отбор few-shot примеров из ПРОВЕРЕННЫХ переводов (судья = 10).
// Одноразовый dev-инструмент (tmp/): классификатор языка здесь НЕ в рантайме —
// в рантайме его нет по приказу владельца (класс E удалён), а для подбора
// примеров нужна защита от «судья поставил 10, но перевод на чужом языке»
// (реальный кейс: de <- «Engañalo. Dile que la piedra aparece negra.»).
import { readFileSync, writeFileSync, existsSync } from "node:fs";

// ВАЖНО: флаг `g` обязателен — String.match БЕЗ него возвращает ОДНО
// совпадение (как exec), и доля CJK всегда была бы ~0.06 вместо ~1.0.
const CJK: Record<string, RegExp> = {
  ja: /[\u3040-\u30ff\u4e00-\u9fff]/g,
  ko: /[\uac00-\ud7af\u1100-\u11ff]/g,
  zh: /[\u4e00-\u9fff]/g,
};
const CYR = /[\u0400-\u04ff]/g;
const CJK_ANY = /[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af\u1100-\u11ff]/g;

/** Стоп-слова для выбора языка среди латинских (отбор few-shot). */
const STOPS: Record<string, string[]> = {
  de: "der die das und ist ich du nicht ein eine mit auf für den dem des zu wie aber auch noch wenn dann wir sie".split(" "),
  es: "el la los las un una y o que de en con para por está estoy es son como pero también más no te lo".split(" "),
  fr: "le la les un une et ou que de en avec pour par est suis sont mais aussi plus ne je vous".split(" "),
  it: "il la gli le un una e o che di in con per da è sono ma anche più non ti lo".split(" "),
  pt: "o a os as um uma e ou que de em com para por é são mas também mais não se para".split(" "),
  pl: "i w na do że się nie jest jak ale lub też od po co mu".split(" "),
  en: "the and is are you that it in to of for with not this have has was were he she they".split(" "),
};

/** Характерные символы, которых НЕТ в целевом языке (для латиницы). */
const FOREIGN_CHARS: Record<string, RegExp> = {
  de: /[ñ¿¡çøå]/, // испанский/португальский/французский/скандинавский
  fr: /[ñßøå]/,
  it: /[ñßçøå]/,
  pl: /[ñßçøå]/,
  pt: /[ßøå]/,
  ru: /[ñß]/,
};

/** Какой из кандидатов языков больше по стоп-словам; null — ничья/не решено. */
function guessLatin(tr: string): string | null {
  const words = tr.toLowerCase().split(/[^a-zà-ÿ]+/).filter((w) => w.length > 1);
  let best = "";
  let bestScore = 0;
  let second = 0;
  for (const [lang, stops] of Object.entries(STOPS)) {
    const set = new Set(stops);
    let s = 0;
    for (const w of words) if (set.has(w)) s++;
    if (s > bestScore) {
      second = bestScore;
      bestScore = s;
      best = lang;
    } else if (s > second) second = s;
  }
  return bestScore >= 2 && bestScore > second ? best : null;
}

function scriptOk(lang: string, tr: string): boolean {
  if (CJK[lang]) return (tr.match(CJK[lang]) ?? []).length / Math.max(1, tr.length) >= 0.55;
  if (lang === "ru") return !CJK_ANY.test(tr) && (tr.match(CYR)?.length ?? 0) / Math.max(1, tr.length) >= 0.5;
  if (CYR.test(tr) || CJK_ANY.test(tr)) return false;
  // однозначно чужие символы (ñ в de/fr/it/pl — это испанский/португальский)
  if (FOREIGN_CHARS[lang]?.test(tr)) return false;
  const guess = guessLatin(tr);
  return guess === null || guess === lang;
}

const { langProfile } = await import("../.opencode/skills/renpy-po/po_langs.mts");

function foreignMarkers(lang: string): RegExp[] {
  return langProfile(lang)
    .forbidden.filter(([, why]) => /испанск|немецк|английск|чужой|instead of|wrong language/i.test(why))
    .map(([re]) => new RegExp(re, "iu"));
}

const LANGS = ["de", "fr", "it", "pl", "pt", "ja", "ko", "zh", "ru"];
const out: Record<string, Array<{ en: string; tr: string }>> = {};

for (const lang of LANGS) {
  const f = `tmp/po_translate_${lang}.jsonl`;
  if (!existsSync(f)) continue;
  const markers = foreignMarkers(lang);
  const recs = readFileSync(f, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((x) => {
      try {
        return JSON.parse(x) as Record<string, string | number | boolean>;
      } catch {
        return null;
      }
    })
    .filter((x): x is Record<string, string | number | boolean> => !!x);

  const picks: Array<{ en: string; tr: string }> = [];
  const seen = new Set<string>();
  const whyNot: Record<string, number> = {};
  const fail = (k: string) => (whyNot[k] = (whyNot[k] ?? 0) + 1);

  for (const r of recs) {
    if (picks.length >= 5) break;
    if (r.rejected || r.error || r.judge !== 10 || !r.msgstr || !r.msgid) continue;
    const en = String(r.msgid).trim();
    const tr = String(r.msgstr).trim();
    if (en.length < 30 || en.length > 150) continue;
    if (tr.length < 12 || tr.length > 300) continue;
    if (seen.has(en)) continue;
    if (/%|\[config|\{\/?[a-zA-Z]/.test(en) || /%\s*d/.test(tr)) continue;
    if (!/[.!?]$/.test(en)) continue;
    if (/^["'«(]/.test(en)) continue;
    if (!scriptOk(lang, tr)) {
      fail("не целевой язык/скрипт");
      continue;
    }
    if (markers.some((m) => m.test(tr))) {
      fail("маркер чужого языка");
      continue;
    }
    seen.add(en);
    picks.push({ en, tr });
  }
  out[lang] = picks;
  console.log(`${lang}: взято ${picks.length} | отбраковано: ${JSON.stringify(whyNot)}`);
}

writeFileSync("tmp/fewshot_pool.json", JSON.stringify(out, null, 1), "utf-8");

console.log();
for (const [l, ps] of Object.entries(out)) {
  if (!ps.length) continue;
  console.log(`=== ${l} ===`);
  for (const p of ps.slice(0, 3)) {
    console.log("  EN:", p.en);
    console.log(`  ${l.toUpperCase()}:`, p.tr);
  }
}
