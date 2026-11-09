/**
 * Клиент судьи (V4: CHARACTERS-пол в SYSTEM, temp0 — лучшая конфигурация по
 * E2E-пробам 2026-11-06: 58/64 дефектов, 0 ложных на 60 чистых).
 * Общий для CLI (translate_judge.mts) и гейта ремонта (translate_run --retrans).
 */
import { SPEAKER_GENDER } from "../../../patches/ai-voice-pack/casts/gender.mts";
import { resolveBackend } from "../../../scripts/llm_backend.mts";

const TARGET: Record<string, string> = {
  ru: "Russian",
  es: "Spanish",
  de: "German",
  fr: "French",
  it: "Italian",
  pl: "Polish",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
};

const makeSystem = (target: string, variant: string): string => {
  const base = `You are a strict translation QA checker for a game. You get an English SOURCE line, its ${target} TRANSLATION, and CHARACTERS with their genders (game data).
Flag "bad" ONLY for GROSS errors:
- the translation is about DIFFERENT content than the source (wrong line, or text from a neighbouring line glued in);
- the meaning is inverted, or key information from the source is missing/invented;
- grammar is broken so it distorts the text;
- gender/agreement is blatantly wrong (female forms for a male character, etc).
Do NOT flag: style, word choice, register, literalness, tone, punctuation, minor awkwardness.`;
  const VARIANTS: Record<string, string> = {
    // v6: тюнинг по фразам-ложнякам ru-перепроверки (E2E judge_fp_probe):
    // адресат-род, идиомы в контексте, кривой источник.
    v6: `${base}
- agreement forms follow the person the line is ABOUT or ADDRESSED to: «ты решила» addressed to a woman is CORRECT even if the speaker is male — never judge 2nd-person forms by the speaker alone;
- idioms and slang must be read in the scene's context (in erotic scenes "come" = orgasm, not arrival);
- if the SOURCE itself is odd or ambiguous, a plausible reading of it is NOT an error.
Answer ONLY JSON {"verdict":"ok","reason":"max8 words"} or {"verdict":"bad","reason":"max8 words"}.`,
    v7: `${base}
- agreement forms follow the person the line is ABOUT or ADDRESSED to: «ты решила» addressed to a woman is CORRECT even if the speaker is male — never judge 2nd-person forms by the speaker alone;
- idioms and slang must be read in the scene's context (in erotic scenes "come" = orgasm, not arrival);
- if the SOURCE itself is odd or ambiguous, a plausible reading of it is NOT an error;
- word choice is NEVER an error: a natural synonym (vulgar, clinical, colloquial) that means the same is correct — never demand a "better" word.
Answer ONLY JSON {"verdict":"ok","reason":"max8 words"} or {"verdict":"bad","reason":"max8 words"}.`,
    // v8: те же фиксы ВПЛЕТЕНЫ в существующие пункты (новые блоки размывали
    // recall: v6/v7 = 48/47 против 58 у базы) — проверяем гипотезу E2E.
    v8: `You are a strict translation QA checker for a game. You get an English SOURCE line, its ${target} TRANSLATION, and CHARACTERS with their genders (game data).
Flag "bad" ONLY for GROSS errors:
- the translation is about DIFFERENT content than the source (wrong line, or text from a neighbouring line glued in);
- the meaning is inverted, or key information from the source is missing/invented;
- grammar is broken so it distorts the text;
- gender/agreement is blatantly wrong (e.g. feminine past for a male character; 2nd-person forms like «ты решила» follow the ADDRESSEE, not the speaker).
Do NOT flag: style, word choice (vulgar vs clinical synonyms mean the same), register, literalness, tone, punctuation, minor awkwardness, idioms read in context (in erotic scenes "come" = orgasm), or a plausible reading of an odd source.
Answer ONLY JSON {"verdict":"ok","reason":"max8 words"} or {"verdict":"bad","reason":"max8 words"}.`,
    // v9: few-shot примеры вместо новых правил (правила v6-v8 размягчали
    // recall 58→47-49); примеры учат исключениям, не переписывая инструкцию.
    v9: `${base}
Examples (verdicts):
SOURCE: Or have you perhaps decided to begin your investigation yourself.
TRANSLATION: Или, может быть, ты решила начать своё исследование самостоятельно? (CHARACTERS: speaker Razaphel=male) -> {"verdict":"ok","reason":"2nd-person form follows the female addressee"}
SOURCE: She cried out for nobody else to hear as she came.
TRANSLATION: Она вскрикнула, чтобы никто другой не услышал, как она кончает. -> {"verdict":"ok","reason":"erotic idiom read in context"}
SOURCE: She reached up with one hand each, grabbing the shafts of the other guards.
TRANSLATION: Она протянула обе руки и схватила за стволы оружия других стражников. -> {"verdict":"ok","reason":"odd source, plausible reading"}
Answer ONLY JSON {"verdict":"ok","reason":"max8 words"} or {"verdict":"bad","reason":"max8 words"}.`,
    // v10: rubric-декомпозиция (литература LLM-as-judge: маленьким моделям
    // помогает проверка каждого критерия отдельно, а не один общий вердикт).
    v10: `You are a strict translation QA checker for a game. You get an English SOURCE line, its ${target} TRANSLATION, and CHARACTERS with their genders (game data).
Judge three dimensions separately, then set verdict:
- content: "bad" if the translation is about DIFFERENT content than the source (wrong line, or text from a neighbouring line glued in), inverted meaning, or missing/invented key information. Idioms count with their contextual meaning (in erotic scenes "come" = orgasm); a plausible reading of an odd/ambiguous SOURCE is correct.
- grammar: "bad" only if grammar is broken so it distorts the text. Never style, word choice, register, literalness, tone, punctuation, minor awkwardness.
- gender: "bad" only if forms contradict CHARACTERS or the person ADDRESSED (2nd-person past follows the addressee, not the speaker).
verdict = "bad" if ANY dimension is "bad", else "ok".
Answer ONLY JSON {"content":"ok|bad","grammar":"ok|bad","gender":"ok|bad","verdict":"ok|bad","reason":"max8 words"}.`,
    // v11: rubric + точные отрицания в СВОИХ измерениях (v10: recall 61, но
    // каждый dim дал свой ноу-хау-FP: артикль в русском, «приходит» вместо
    // оргазма, род по спикеру и т.д.).
    v11: `You are a strict translation QA checker for a game. You get an English SOURCE line, its ${target} TRANSLATION, and CHARACTERS with their genders (game data).
Judge three dimensions separately, then set verdict:
- content: "bad" ONLY if the translation is about DIFFERENT content than the source (wrong line, or text from a neighbouring line glued in), asserts the OPPOSITE meaning, or drops/invents KEY information. Paraphrase shifts (think/believe) are NOT opposite. Idioms count with their contextual meaning — in erotic scenes "come" means orgasm, so a word for climaxing is CORRECT. If the SOURCE itself is odd or ambiguous, its most natural reading is CORRECT.
- grammar: "bad" ONLY if grammar is broken so it distorts the text. Russian has NO articles — never flag article differences. Never style, word choice (synonyms incl. vulgar/clinical), register, literalness, tone, punctuation, minor awkwardness.
- gender: "bad" ONLY if forms contradict CHARACTERS: feminine past for a MALE character. 2nd-person past («ты решила») follows the person ADDRESSED, not the speaker — check who is being spoken TO.
verdict = "bad" if ANY dimension is "bad", else "ok".
Answer ONLY JSON {"content":"ok|bad","grammar":"ok|bad","gender":"ok|bad","verdict":"ok|bad","reason":"max8 words"}.`,
    // v12: v10 + только запрет артиклей (единственный FP на чистых: «missing
    // article 'the'» — артиклей в русском нет). Остальные исключения НЕ
    // добавляем: эксперименты показали, что они режут recall.
    v12: `You are a strict translation QA checker for a game. You get an English SOURCE line, its ${target} TRANSLATION, and CHARACTERS with their genders (game data).
Judge three dimensions separately, then set verdict:
- content: "bad" if the translation is about DIFFERENT content than the source (wrong line, or text from a neighbouring line glued in), inverted meaning, or missing/invented key information. Idioms count with their contextual meaning (in erotic scenes "come" = orgasm); a plausible reading of an odd/ambiguous SOURCE is correct.
- grammar: "bad" only if grammar is broken so it distorts the text. Russian has NO articles — article differences are never an error. Never style, word choice, register, literalness, tone, punctuation, minor awkwardness.
- gender: "bad" only if forms contradict CHARACTERS or the person ADDRESSED (2nd-person past follows the addressee, not the speaker).
verdict = "bad" if ANY dimension is "bad", else "ok".
Answer ONLY JSON {"content":"ok|bad","grammar":"ok|bad","gender":"ok|bad","verdict":"ok|bad","reason":"max8 words"}.`,
  };
  const tail = `\nAnswer ONLY JSON {"verdict":"ok","reason":"max8 words"} or {"verdict":"bad","reason":"max8 words"}.`;
  return VARIANTS[variant] ?? base + tail;
};

/** SYSTEM промпт судьи (общий источник для CLI, гейта и стенда проб). */
export const judgeSystem = makeSystem;

// Ступень 2 (verify): модель, получившая ОДНО обвинение, заметно лучше
// отличает грубый брак от придирки, чем в режиме «ищи что найдёшь».
// Примеры отказов — синтетические (не из fp-проба, чтобы не подгонять бенчмарк):
// калибровка по классам придирок: парафраз=смысл, род по адресату, эротическая
// идиома (E2E-итерация v10+verify-ex, 2026-11-06).
const verifySystem = (
  target: string,
): string => `You verify ONE accusation against a ${target} translation of a game. You get the English SOURCE line, the TRANSLATION, CHARACTERS (genders game data), and the ACCUSED ERROR.
Answer "confirmed" ONLY if the accusation describes a GROSS error: the translation is about DIFFERENT content (wrong line, or text from a neighbouring line glued in), asserts the OPPOSITE meaning, drops/invents KEY information, has grammar broken so it distorts the text, or has gender forms contradicting CHARACTERS (feminine past for a male character; 2nd-person past follows the ADDRESSEE, not the speaker).
Answer "dismissed" if the accusation is a nitpick: style, word choice or synonyms (incl. vulgar/clinical), register, literalness, tone, punctuation, article differences (Russian has no articles), idioms read in context (in erotic scenes "come" = orgasm), a plausible reading of an odd or ambiguous SOURCE, or a paraphrase that keeps the meaning.
Examples of accusations with verdicts:
- "Inverted meaning: 'think' vs 'seems'" on a paraphrase that keeps the meaning -> {"verdict":"dismissed","reason":"paraphrase keeps meaning"}
- "Gender mismatch: «решила» is feminine but speaker is male" when the ADDRESSEE is a woman -> {"verdict":"dismissed","reason":"form follows the addressee"}
- "'came' should mean arrival" in an erotic scene -> {"verdict":"dismissed","reason":"erotic idiom in context"}
Answer ONLY JSON {"verdict":"confirmed"|"dismissed","reason":"max8 words"}.`;

export interface JudgeResult {
  v: string;
  r: string;
}

// Self-consistency (MT-Bench/2306.05685): k семплов при temp>0, голосование.
// Придирки нестабильны между семплами → отваливаются; реальные дефекты
// стабильны → остаются. JUDGE_VOTES=1 (дефолт) — один вызов, как раньше.
const VOTES = Number(process.env.JUDGE_VOTES ?? "1");

/** Поле CHARACTERS для SYSTEM судьи: спикер + упомянутые имена с полом. */
// Алиасы имён (никнейм → полное имя): судья сравнивает EN-строку и перевод,
// и без знания «Xan = Ксантиппа» флагает name mismatch и колеблется по полу.
// Знание идентичности, а не индексы — безопасно для всех языков.
const NAME_ALIASES = new Map([["Xan", "Xanthippe"]]);

export const charsOf = (msgctxt: string, msgid: string, nameCanon: Map<string, string>): string => {
  const parts: string[] = [];
  const sp = msgctxt.replace(/^speaker:/, "").replace(/^"|"$/g, "");
  if (sp !== "Narrator" && SPEAKER_GENDER[sp])
    parts.push(`speaker ${sp}=${SPEAKER_GENDER[sp] === "M" ? "male" : "female"}`);
  for (const [en, canon] of nameCanon) {
    if (msgid.includes(en) && SPEAKER_GENDER[en])
      parts.push(`${canon}=${SPEAKER_GENDER[en] === "M" ? "male" : "female"}`);
  }
  for (const [alias, full] of NAME_ALIASES) {
    if (msgid.includes(alias) && SPEAKER_GENDER[full] && nameCanon.has(full)) {
      parts.push(
        `${alias}=${SPEAKER_GENDER[full] === "M" ? "male" : "female"} (тот же человек, имя в переводе: ${nameCanon.get(full)})`,
      );
    }
  }
  return parts.length ? `\nCHARACTERS: ${parts.join(", ")}` : "";
};

/** Судит одну строку. null — не разобрал (сеть/формат): НЕ блокирует. */
export const judgeLine = async (
  en: string,
  tr: string,
  lang: string,
  chars = "",
  temp = 0,
  variant = "v10", // прод-конфиг по E2E-матрице 2026-11-06: recall 61/64
  verify = false,
): Promise<JudgeResult | null> => {
  const { url, model } = resolveBackend();
  const target = TARGET[lang] ?? lang;
  const user = `SOURCE (en): ${en}\nTRANSLATION (ru): ${tr}`;
  // при голосовании нужны НЕДЕТЕРМИНИРОВАННЫЕ семплы: temp0 дал бы k копий.
  const effTemp = VOTES > 1 && temp === 0 ? 0.7 : temp;
  const call = async (system: string): Promise<string | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(`${url.replace(/\/+$/, "")}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            temperature: effTemp,
            max_tokens: 200,
            stream: false,
            reasoning_effort: "none",
          }),
          signal: AbortSignal.timeout(60_000),
        });
        const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: unknown };
        const s = d.choices?.[0]?.message?.content ?? "";
        if (s) return s;
      } catch {
        /* retry */
      }
    }
    return null;
  };

  // Голосование: k семплов ступени1, большинство; verify — по итогу.
  const samples: Array<{ v: string; r: string }> = [];
  for (let k = 0; k < Math.max(1, VOTES); k++) {
    const s1 = await call(makeSystem(target, variant) + chars);
    const v = s1 ? /"verdict"\s*:\s*"(ok|bad)"/.exec(s1)?.[1] : undefined;
    if (!v) continue;
    samples.push({ v, r: (s1 ? (/"reason"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(s1)?.[1] ?? "") : "").slice(0, 70) });
  }
  if (!samples.length) return null;
  const badCount = samples.filter((x) => x.v === "bad").length;
  const first = samples.find((x) => x.v === (badCount * 2 > samples.length ? "bad" : "ok")) ?? samples[0];
  const v = first.v;
  const reason = first.r;
  if (v === "ok" || !verify) return { v, r: reason };
  // Ступень 2: одно обвинение + правила → модель вправе его отклонить.
  const s2 = await call(verifySystem(target) + chars + `\nACCUSED ERROR: ${reason || "possible gross error"}`);
  const v2 = s2 ? /"verdict"\s*:\s*"(confirmed|dismissed)"/.exec(s2)?.[1] : undefined;
  if (!v2) return { v, r: reason }; // не разобрали — оставляем флаг (не ослабляем)
  return v2 === "dismissed" ? { v: "ok", r: `отклонено: ${reason}` } : { v: "bad", r: reason };
};
