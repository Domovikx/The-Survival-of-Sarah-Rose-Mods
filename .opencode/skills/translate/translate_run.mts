/** Живой прогон перевода по po (построчно, правила из скилла translate). */
import { appendFileSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

import { parsePo, renderPo, writePoAtomic } from "../../../.opencode/skills/renpy-po/po_core.mts";
import { potIndex } from "../../../.opencode/skills/renpy-po/pot_resolve.mts";
import { isDemoScope } from "../../../.opencode/skills/renpy-po/po2tl.mts";
import { resolveBackend } from "../../../scripts/llm_backend.mts";
import { SPEAKER_GENDER } from "../../../patches/ai-voice-pack/casts/gender.mts";

import { buildNameCanon, charsOf, judgeLine } from "./judge_client.mts";
import { commonRun, contentWords } from "./review_common_run.mts";

// Позиционные: <lang> [limit] [arc]; флаги и их значения (--retrans <файл>)
// позициями не считаются (баг 2026-11-09: путь файла уходил в фильтр арки).
const positional: string[] = [];
for (let k = 2; k < process.argv.length; k++) {
  const a = process.argv[k];
  if (a.startsWith("--")) {
    if (a === "--retrans") k++;
    continue;
  }
  positional.push(a);
}
const LANG = positional[0] ?? "ru";
const LIMIT = Number(positional[1] ?? 0) || 0;
const ARC = positional[2] ?? ""; // фильтр по арке (пусто = весь файл)
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
const PO = join("patches", "ai-voice-pack", "po", `${LANG}.po`);
const SKILL = join(".opencode", "skills", "translate", "SKILL.md");
const DONE = join("tmp", `translate_${LANG}.done`);
const LIVE = join("tmp", `translate_${LANG}.live.log`);
// --improve: dry-режим «что можно улучшить» — игнорирует done, логирует
// кандидатов в отдельный файл, po и done НЕ трогает.
const IMPROVE = process.argv.includes("--improve");
const IMPROVE_LOG = join("tmp", `translate_${LANG}.improve.log`);

// Режим ремонта: --retrans <файл индексов> — перевести заново ТОЛЬКО эти
// строки (уже имеющие перевод), минуя done: ремонт легаси-вклеек УТЕЧКА
// из translate_review --all (пилот 2026-11-06).
const retransArg = process.argv.indexOf("--retrans");
const RETRANS: number[] | null =
  retransArg >= 0
    ? readFileSync(process.argv[retransArg + 1], "utf-8")
        .split(/\s+/)
        .filter((x) => x.trim())
        .map(Number)
        .filter(Number.isFinite)
    : null;

// --demo: только демо-скоуп поставки (menu/ui/имена + start + Prologue +
// сцены по ChooseThePath, 2026-11-09: не тратим ресурсы на то, что не идёт
// в патч1; полные переводы — по спросу).
const DEMO_ONLY = process.argv.includes("--demo");

// правила — из скилла (единый источник)
const skill = readFileSync(SKILL, "utf-8");
const o = skill.indexOf("<!-- ПРАВИЛА -->"),
  c = skill.indexOf("<!-- /ПРАВИЛА -->");
const rules = skill.slice(o + "<!-- ПРАВИЛА -->".length, c).trim();

const text = readFileSync(PO, "utf-8").replace(/\r\n/g, "\n");
const entries = parsePo(text).filter((e) => e.msgid);
const header = text.split("\n\n")[0].split("\n");

// Канон имён: строки msgctxt=speaker-name в po — принятые написания имён.
// Перевод СЛЕДУЕТ им для однообразия (решение владельца 2026-11-03): имя в
// наррации/реплике пишется так же, как в своей словарной строке.
const NAME_CANON = buildNameCanon(entries);
// Кросс-имена и стоп-лист: «Сара» в строке с Varga — не искажение Варги.
const CANON_WORDS = new Set<string>();
for (const v of NAME_CANON.values()) for (const part of v.split(" ")) CANON_WORDS.add(part);
const NAME_STOP = new Set([
  "Если",
  "Стала",
  "Сама",
  "Сила",
  "Рада",
  "Само",
  "Шаха",
  "Снаружи",
  "Девочка",
  "Девонька",
  "Торговец",
  "Торговцы",
  "Ваша",
  "Твоя",
  "Моя",
  "Леди",
  "Рана",
  "Страх",
  "Жар",
  "Раба",
  "Паря",
  "Хана",
  "Старая",
  "Самая",
  "Мэтт",
]);

const done = new Set<number>();
try {
  for (const l of readFileSync(DONE, "utf-8").split("\n")) if (l.trim()) done.add(Number(l));
} catch {
  /* первый запуск */
}

// HEAD-снимок: «форма уже была в старом переводе» — не брак (склонения вида
// «Торговцев» ловились гейтом имён и уводили строки в лишние повторы).
const HEAD_MAP = new Map<string, string>();
try {
  const head = execSync(`git show HEAD:patches/ai-voice-pack/po/${LANG}.po`, { maxBuffer: 64 * 1024 * 1024 }).toString(
    "utf-8",
  );
  for (const he of parsePo(head.replace(/\r\n/g, "\n")))
    if (he.msgid) HEAD_MAP.set(`${he.msgctxt}\u0000${he.msgid}`, he.msgstr);
} catch {
  /* не git — работаем без фильтра */
}

const { url, model } = resolveBackend();
const call = async (sys: string, usr: string, temp = 0): Promise<string> => {
  const r = await fetch(`${url.replace(/\/+$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      temperature: temp,
      max_tokens: 900,
      stream: false,
      reasoning_effort: "none",
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: unknown };
  const s = d.choices?.[0]?.message?.content ?? "";
  if (!s) throw new Error(JSON.stringify(d.error ?? d).slice(0, 140));
  return s;
};
const fieldOf = (raw: string, key: string): string => {
  const k = raw.indexOf(`"${key}"`);
  if (k < 0) return "";
  const colon = raw.indexOf(":", k);
  // Значение: ASCII-кавычки или «ёлочки» (модель в русском выводе их любит);
  // иногда открывающая кавычка приходит экранированной: "tr":\"...\".
  let p0 = colon + 1;
  while (p0 < raw.length && /\s/.test(raw[p0])) p0++;
  const glitch = raw[p0] === "\\";
  if (glitch) p0++;
  const openQ = raw[p0];
  const closeQ = openQ === "«" ? "»" : openQ === '"' ? '"' : null;
  if (!closeQ) return "";
  let out = "";
  for (let p = p0 + 1; p < raw.length; p++) {
    const ch = raw[p];
    if (glitch && ch === "\\" && raw[p + 1] === closeQ) break; // закрывающий \"
    if (ch === "\\" && p + 1 < raw.length) {
      const nx = raw[p + 1];
      out += nx === "n" ? "\n" : nx === "t" ? "\t" : nx;
      p++;
      continue;
    }
    if (ch === closeQ) break;
    out += ch;
  }
  return out;
};
const trOf = (raw: string): string => fieldOf(raw, "tr");
const sceneOf = (raw: string): string => fieldOf(raw, "scene");

/** Расстояние Левенштейна (для поиска искажений имён: «Мария» vs «Марион»). */
const editDist = (a: string, b: string): number => {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return dp[b.length];
};

let changed = 0,
  same = 0,
  failed = 0,
  doneCount = 0;
const pending: number[] = [];
// flush() крутится в setInterval ВНЕ рабочего try/catch: любая ошибка ФС
// (EPERM от антивируса/индексатора на rename, закрытый диск) = uncaughtException
// = мгновенная смерть процесса без вывода (инцидент 2026-11-06: падение
// ~176-й правки, лог замаскирован фильтром). Теперь: логируем и ретраим на
// следующем тике (pending НЕ очищаем — po пишется атомарно из памяти).
const flush = (): void => {
  if (!pending.length) return;
  try {
    if (process.env.TSSR_FAULT === "flush" && flushFaults-- > 0)
      throw new Error("TSSR_FAULT=flush (fault-injection тест)");
    writePoAtomic(PO, renderPo(entries, header)); // одна запись на батч
    appendFileSync(DONE, pending.map((x) => String(x)).join("\n") + "\n", "utf-8");
    pending.length = 0;
  } catch (err) {
    console.error(`[FLUSH-RETRY] ${new Date().toISOString()} ${String(err)} | в очереди ${pending.length}`);
  }
};
// Fault-injection секи (env TSSR_FAULT=flush|timer, тест инцидента 2026-11-07):
// flush — бросок ДО try (симуляция сбоя записи), timer — бросок в колбэке
// setInterval (симуляция uncaughtException, лечится process.on ниже).
let flushFaults = Number(process.env.TSSR_FAULT_N ?? "2");
let timerFault = process.env.TSSR_FAULT === "timer";
// Страховка долгого прогона: сбои вне построчного try не убивают процесс —
// логируются в stdout (полный лог обязан быть без фильтров — см. инцидент).
process.on("uncaughtException", (err) =>
  console.error(`[CONTINUE] uncaught ${new Date().toISOString()} ${String(err)}`),
);
process.on("unhandledRejection", (reason) =>
  console.error(`[CONTINUE] unhandledRejection ${new Date().toISOString()} ${String(reason)}`),
);
const flushTimer = setInterval(() => {
  if (timerFault) {
    timerFault = false;
    throw new Error("TSSR_FAULT=timer (fault-injection: uncaught в колбэке)");
  }
  flush();
}, 2000); // файл обновляется раз в 2с
const t0 = Date.now();
let cursor = 0;
// Очередь: арка (или весь файл); уже обработанное — пропускается.
const queue: number[] = [];
if (RETRANS) {
  for (const i of RETRANS) if (i >= 0 && i < entries.length) queue.push(i);
} else {
  for (let i = 0; i < entries.length; i++) {
    // po — источник истины очереди: заполненное = сделано (без done-файлов —
    // tmp-состояние не критично и восстанавливается из po). done = только кэш.
    if (!IMPROVE && (done.has(i) || entries[i].msgstr.trim())) continue;
    const e = entries[i];
    if (ARC && potIndex().resolve(e.msgctxt, e.msgid)?.arc !== ARC) continue;
    if (DEMO_ONLY && !isDemoScope(e.msgctxt, potIndex().resolve(e.msgctxt, e.msgid))) continue;
    queue.push(i);
  }
}
const total = LIMIT > 0 ? Math.min(LIMIT, queue.length) : queue.length;

const worker = async (): Promise<void> => {
  for (;;) {
    const qi = cursor++;
    if (qi >= total) return;
    const i = queue[qi];
    const e = entries[i];
    // Имён не трогаем: переписывание имён (Took -> «Взял», Xanthippe -> «Ксанфиппа»)
    // ломает консистентность корпуса и связь с озвучкой. Правило «имена остаются
    // именами» модель не держит — поэтому строки speaker-name пропускаются.
    if (e.msgctxt === "speaker-name") {
      if (!IMPROVE) appendFileSync(DONE, `${i}\n`, "utf-8");
      same++;
      doneCount++;
      continue;
    }
    const at = (k: number): string | null => {
      const x = entries[i + k];
      return x ? `${x.msgctxt} ${x.msgid}` : null;
    };
    const prevCtx = [-3, -2, -1].map(at).filter((x): x is string => Boolean(x));
    const nextCtx = [at(1)].filter((x): x is string => Boolean(x));
    const ctxBlock =
      prevCtx.length || nextCtx.length
        ? `CONTEXT — for understanding only; translate ONLY the target line:\n` +
          (prevCtx.length ? `PREVIOUS lines (already happened):\n${prevCtx.join("\n")}\n` : "") +
          (nextCtx.length ? `NEXT line (comes right AFTER this line):\n${nextCtx.join("\n")}\n` : "") +
          "\n"
        : "";
    const name = e.msgctxt.replace(/^speaker:/, "").replace(/^"|"$/g, "");
    const g = SPEAKER_GENDER[name] ?? null;
    const genderNote =
      name === "Narrator"
        ? " (narration: agreement follows the characters in the line, never the narrator)"
        : g
          ? ` (gender ${g})`
          : "";
    // Промпт после фикса баги «Король Оруэлл\nОх, Сара...» (воспроизводилась
    // 3/3): цель НЕ должна выглядеть как строка скрипта «speaker: ...» — иначе
    // модель воспроизводит паттерн и вставляет имя спикера в перевод.
    const names: string[] = [];
    const gtag = (en: string): string => {
      const g = SPEAKER_GENDER[en];
      return g
        ? ` (${g === "M" ? "MALE — masculine agreement: он, -лся, -л" : "FEMALE — feminine agreement: она, -лась, -ла"})`
        : "";
    };
    if (NAME_CANON.has(name)) names.push(`${name} -> ${NAME_CANON.get(name)}${gtag(name)}`);
    for (const [en, canon] of NAME_CANON) if (e.msgid.includes(en)) names.push(`${en} -> ${canon}${gtag(en)}`);
    // Канон места: корпус — «Розанна» (357 против70 «Росанна» и3 в HEAD).
    if (e.msgid.includes("Rosanna") && !names.some((x) => x.startsWith("Rosanna "))) names.push("Rosanna -> Розанна");
    const namesBlock = names.length
      ? `NAMES — exact renderings; the GENDER in parentheses drives grammatical agreement (trust it, never guess from the name):\n${[...new Set(names)].join("\n")}\n\n`
      : "";
    const menuNote = /^(menu|ui)/.test(e.msgctxt)
      ? `NOTE: this is a MENU/UI LABEL — keep it a short action label in the same form as the EN (no full sentence).\n`
      : "";
    const buildUser = (feedback = ""): string =>
      ctxBlock +
      namesBlock +
      `Said by: ${name}${genderNote}\nEN: ${e.msgid}\n${menuNote}\n` +
      `STEP 1 — RESEARCH: using the context, write 2-3 sentences in ENGLISH (Latin script only) about the situation: ` +
      `who is speaking to whom, what just happened, and what this line does — and note each character's gender from NAMES in parentheses. ` +
      `Mind the ADDRESSEE — it decides forms like past-tense "you" — and the GENDER of every character (from NAMES).\n` +
      `STEP 2 — TRANSLATE ONLY the EN line into ${TARGET[LANG] ?? LANG}. The value of "tr" must contain ` +
      `the translation and NOTHING ELSE: no speaker name, no label, no line breaks. Keep EVERY clause of the EN line, ` +
      `include NOTHING from the scene or neighbouring lines — never continue the story — and make "tr" grammatically correct.\n` +
      `BEFORE outputting, check "tr" against your STEP 1 research: 2nd-person past forms follow the ADDRESSEE you found, ` +
      `agreement follows the GENDER of each character (see NAMES), names are spelled EXACTLY as in NAMES. ` +
      `Never guess gender from a name itself — NAMES is the only source. ` +
      `Fix "tr" if it disagrees.\n` +
      `Output ONLY JSON {"scene":"<research>","tr":"<translation>"}.` +
      (feedback
        ? `\n\nYour PREVIOUS attempt was REJECTED: ${feedback}\nReturn a corrected "tr" that fixes ONLY this problem and changes nothing else. ` +
          `Translate ONLY the EN line above — never the content of neighbouring lines. ` +
          `If the EN line is a short narration like "X whispered to Y.", the translation must be ONLY that attribution — the spoken words appear in a SEPARATE line and must NOT be added. ` +
          `Translate LITERALLY, word for word: every word of the EN line and no other words.`
        : "");
    // Шлюзы: мусор в переводе ловим без судьи (по инцидентам прогона).
    const badParts = (tr: string): string | null => {
      if (!tr) return "пустой перевод";
      if (tr.includes("\n")) return "перевод строки внутри tr (имя или лейбл)";
      // Смесь кириллицы и латиницы в одном слове («Марion») — глюк модели;
      // в оригинале такого нет, значит и в переводе быть не должно.
      const mixed = /[а-яёА-ЯЁ][a-zA-Z]|[a-zA-Z][а-яёА-ЯЁ]/;
      if (mixed.test(tr) && !mixed.test(e.msgid)) return "смешанные алфавиты в одном слове";
      // Скобочные формы рода («прав(а)», «видел(а)») — художественный текст их не пишет.
      if (/\([а-яё]{1,8}\)/.test(tr) && !/\([a-zA-Zа-яё]{1,8}\)/.test(e.msgid))
        return "скобочная форма рода в переводе";
      // Потерянное отрицание: в оригинале not/no/never..., в переводе нет ни одного
      // русского маркера отрицания. \b на кириллице не работает — только lookaround;
      // маркеры: «не» (отдельно и приставкой), «ни…», «без», «отсутств-».
      // Языко-специфично: на не-ru языках маркеры не совпадают → ложные сбои (пилот de).
      const ruNeg = (s: string): boolean =>
        /(?<![а-яёА-ЯЁ])не(?![а-яёА-ЯЁ])|(?<![а-яёА-ЯЁ])не(?=[а-яё])|(?<![а-яёА-ЯЁ])ни|(?<![а-яёА-ЯЁ])без(?![а-яёА-ЯЁ])|отсутств/i.test(
          s,
        );
      if (
        LANG === "ru" &&
        /\b(?:not|nobody|nothing|none|never|cannot|can't|don't|doesn't|didn't|won't|wouldn't|couldn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|no)\b/i.test(
          e.msgid,
        ) &&
        !ruNeg(tr)
      ) {
        return "потеряно отрицание";
      }
      // Регистр обращений не меняем против HEAD (ты↔вы — устойчивость отношений).
      const headTr = HEAD_MAP.get(`${e.msgctxt}\u0000${e.msgid}`) ?? "";
      const famTy = (s: string): boolean =>
        /(?<![а-яёА-ЯЁ])ты(?![а-яёА-ЯЁ])|(?<![а-яёА-ЯЁ])теб|(?<![а-яёА-ЯЁ])тво/i.test(s);
      const famVy = (s: string): boolean =>
        /(?<![а-яёА-ЯЁ])вы(?![а-яёА-ЯЁ])|(?<![а-яёА-ЯЁ])вам|(?<![а-яёА-ЯЁ])вас|(?<![а-яёА-ЯЁ])ваш/i.test(s);
      if (headTr && ((famTy(tr) && !famVy(tr) && famVy(headTr)) || (famVy(tr) && !famTy(tr) && famTy(headTr)))) {
        return "смена регистра ты/вы против HEAD";
      }
      // Название игры — как имя: не переводится (правило 6 скилла).
      if (e.msgid.includes("The Survival of Sarah Rose") && !tr.includes("The Survival of Sarah Rose")) {
        return "название игры переведено — должно остаться как есть";
      }
      // Метка/название: msgid — только заглавных слов → tr не должен стать
      // полноценным предложением («Castle Reinmeer» → «Замок Рейнмир возвышается...»).
      const srcWords = e.msgid.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
      if (srcWords.length >= 1 && srcWords.length <= 6 && srcWords.every((w) => w[0] !== w[0].toLowerCase())) {
        // Слова, НАЧИНАЮЩИЕСЯ со строчной и длиной ≥2 (не подстрочные «амок» и
        // не «а» из «А-а-а»): в метке3+ таких слов — это уже предложение.
        const words = tr.split(/[^а-яёА-ЯЁ]+/).filter(Boolean);
        const lower = words.filter((w) => w.length >= 2 && w[0] === w[0].toLowerCase() && w[0] !== w[0].toUpperCase());
        if (lower.length > 2) return "метка развернулась в предложение";
      }
      // Утечка соседней строки: tr почти дословно совпадает с переводом соседа,
      // при том что EN-оригиналы сильно отличаются (случай «Kate shrugged.» →
      // текст следующей реплики). Это не про длину — это про чужую строку.
      // Плюс вклейка ЧАСТИ соседа (второе предложение): общий словесный фрагмент —
      // ловит «перевод соседней строки целиком» при temp0 (пилот --retrans
      // 2026-11-06: 18/30). Пороги калиброваны на ru: стоп-словa русские →
      // на других языках без contentWords, просто длина фрагмента.
      const sim = (a: string, b: string): number => 1 - editDist(a, b) / Math.max(a.length, b.length, 1);
      for (const n of [entries[i - 1], entries[i + 1]]) {
        if (!n || !n.msgstr || !n.msgid || n.msgid === e.msgid) continue;
        if (sim(e.msgid, n.msgid) >= 0.6) continue; // оригиналы-дубли переводятся одинаково — не брак
        if (sim(tr, n.msgstr) > 0.75) return "похоже на перевод соседней строки";
        const run = commonRun(tr, n.msgstr);
        const rw = run ? run.split(" ").length : 0;
        if (
          run &&
          (LANG === "ru" ? rw >= 3 && contentWords(run) >= 2 : rw >= 4) &&
          commonRun(e.msgid, n.msgid).split(" ").length < 3
        ) {
          return `вклейка соседней строки: «${run}»`;
        }
      }
      const srcTags: string[] = e.msgid.match(/\{[^}]+\}|\[[^\]]+\]/g) ?? [];
      const trTags: string[] = tr.match(/\{[^}]+\}|\[[^\]]+\]/g) ?? [];
      const missingTags = srcTags.filter((t) => !trTags.includes(t));
      if (missingTags.length) return `потеряна разметка: ${missingTags.join(" ")}`;
      const foreign = trTags.filter((t) => !srcTags.includes(t));
      if (foreign.length) return `чужая разметка в переводе: ${foreign.join(" ")}`;
      // Паттерн баги «Король Оруэлл\n...»: имя спикера в НАЧАЛЕ перевода,
      // хотя в оригинале его нет.
      const ru = NAME_CANON.get(name);
      if (ru && tr.startsWith(ru) && !e.msgid.includes(name)) return `имя спикера в начале перевода: ${ru}`;
      // Искажения имени («Мария/Мариян/Маррион» вместо «Марион»): слово похоже
      // на канон, но не оно и не его склонение — приоритет стереотипа имени.
      const words = tr.match(/[А-ЯЁ][а-яё]+/g) ?? [];
      for (const [enName, canon] of NAME_CANON) {
        if (!e.msgid.includes(enName)) continue;
        const g = SPEAKER_GENDER[enName];
        for (const cw of canon.split(" ")) {
          if (cw.length < 4) continue;
          for (const w of words) {
            // канон, его склонения и формы с отбрасыванием ь (Король -> Короля)
            if (w === cw || w.startsWith(cw) || w.startsWith(cw.slice(0, -1))) continue;
            if (CANON_WORDS.has(w) || NAME_STOP.has(w)) continue; // другое имя или общее слово
            if (cw.includes(w)) continue; // короткая форма полного имени (Ая ← Аяка)
            if ([...CANON_WORDS].some((c) => c.length >= 4 && w.startsWith(c))) continue; // склонение ДРУГОГО имени (Сакара ← Сакар)
            if (w.length >= 5 && cw.length >= 5 && w.startsWith(cw.slice(0, -2))) continue; // падежная форма (Торговца ← Торговец, Старого ← Старый)
            const d = editDist(w, cw);
            if (d > 3) continue;
            // d≤2 — подмена в середине слова (Кэролин/Каролин, Сигмунд/Зигмунд):
            // всегда брак; d=3 — только при совпадении префикса (Мариян/Барион).
            if (d === 3 && !w.startsWith(cw.slice(0, 3))) continue;
            if (HEAD_MAP.get(`${e.msgctxt}\u0000${e.msgid}`)?.includes(w)) continue; // форма была и в HEAD — не брак
            return `искажение имени «${cw}»: «${w}»`;
          }
          // Женский род при мужском имени: «Марион подняла/сделала».
          if (g === "M") {
            const fem = new RegExp(`\\b${cw}\\s+(?:[а-яё]+\\s+){0,2}[а-яё]+ла[сь]?\\b`).exec(tr);
            if (fem) return `женский род при мужском имени «${cw}»: «${fem[0]}»`;
          }
        }
      }
      return null;
    };
    let lastTr = ""; // для лога отклонённого кандидата (правило «полный лог»)
    try {
      const sys = `You translate this game into ${TARGET[LANG] ?? LANG}. Follow these rules:\n\n${rules}`;
      // Гейт судьи — только в режиме ремонта (--retrans): вклеенные/не те строки
      // ловит семантика, а не строковое сходство (пилот 2026-11-06: 18/30).
      const judgeGate = async (t: string): Promise<string | null> => {
        if (!RETRANS) return null;
        const j = await judgeLine(e.msgid, t, LANG, charsOf(e.msgctxt, e.msgid, NAME_CANON));
        return j && j.v === "bad" ? `судья: ${j.r}` : null;
      };
      let raw = await call(sys, buildUser());
      let tr = trOf(raw);
      let scene = sceneOf(raw);
      let bad = (await badParts(tr)) ?? (await judgeGate(tr));
      for (let attempt = 1; attempt <= 2 && bad; attempt++) {
        // Повторы с температурой: при temp0 модель ДЕТЕРМИНИРОВАННО повторяет
        // брак (глюк имени/кавычек) — только другой сэмпл может его обойти.
        // Обратная связь с причиной отклонения (2026-11-09): лечит детерминированные
        // склейки с соседней репликой (fr/it/zh[706]) — E2E-замер в журнале.
        raw = await call(sys, buildUser(bad), attempt === 1 ? 0.7 : 1.0);
        tr = trOf(raw);
        scene = sceneOf(raw) || scene;
        bad = (await badParts(tr)) ?? (await judgeGate(tr));
        if (bad && process.env.DBG) console.log(`RAW>>>\n${raw}\n<<<RAW`);
      }
      lastTr = tr;
      if (bad) throw new Error(bad);
      doneCount++;
      if (!tr) {
        failed++;
        console.log(`  СБОЙ [${i}] ${e.msgid.slice(0, 60)}`);
      } else if (tr !== e.msgstr) {
        const line = `[изменено ${i}] ${e.msgctxt} ${e.msgid.slice(0, 80)}\n   СЦЕНА: ${scene.slice(0, 200)}\n   БЫЛО:  ${e.msgstr.slice(0, 200)}\n   СТАЛО: ${tr.slice(0, 200)}\n`;
        e.msgstr = tr;
        changed++;
        console.log(line.trimEnd());
        if (IMPROVE) appendFileSync(IMPROVE_LOG, line, "utf-8");
        else {
          pending.push(i);
          appendFileSync(LIVE, line, "utf-8");
        } // po+done — через flush()
      } else {
        same++;
        if (!IMPROVE) pending.push(i);
      }
      if (doneCount % 50 === 0) {
        const sec = (Date.now() - t0) / 1000;
        console.log(
          `  ...${doneCount}/${total} изменено=${changed} совпало=${same} сбои=${failed} ${(sec / doneCount).toFixed(1)}с/стр`,
        );
      }
    } catch (err) {
      // Не вылечили за 3 попытки: если старый перевод есть — оставляем его
      // (в HEAD порчи нет) и закрываем строку; пустую — сбой для следующего прогона.
      if (e.msgstr.trim()) {
        if (!IMPROVE) pending.push(i);
        same++;
        doneCount++;
        console.log(
          `  СТАРОЕ [${i}] ${String(err).slice(0, 90)} | кандидат: ${lastTr.slice(0, 60)} | оставлено: ${e.msgstr.slice(0, 60)}`,
        );
      } else {
        failed++;
        console.log(`  ОШИБКА [${i}] ${String(err).slice(0, 140)}`);
      }
    }
  }
};

console.log(
  `прогон ${PO} | ${TARGET[LANG]} | ${model} | арка: ${ARC || "—"}${DEMO_ONLY ? " | DEMO-скоуп" : ""} | к работе ${total} (уже сделано ${IMPROVE ? "—" : done.size})${RETRANS ? " | MODE=retrans: ремонт строк из файла" : IMPROVE ? " | MODE=improve: ничего не записывается" : ""}`,
);
// Главный поток под защитой: сбой воркера не должен висеть на интервале —
// flush + clearInterval + ясный код выхода (инцидент 2026-11-07).
try {
  await Promise.all(Array.from({ length: 8 }, () => worker()));
} catch (err) {
  console.error(`[FATAL] ${new Date().toISOString()} ${String(err)}`);
  clearInterval(flushTimer);
  flush();
  console.log(`ПРЕРВАНО: обработано ${doneCount}, изменено ${changed}, совпало ${same} | po дозаписан`);
  process.exit(1);
}
flush();
clearInterval(flushTimer);
console.log(
  `ГОТОВО: обработано ${doneCount}, изменено ${changed}, совпало ${same}, сбои ${failed}, ${((Date.now() - t0) / 1000) | 0}с`,
);
