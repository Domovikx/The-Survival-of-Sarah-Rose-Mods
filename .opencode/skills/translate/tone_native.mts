/**
 * Правка регистра РОДНЫМ форматом переводческой модели (Index-Translate).
 *
 * Почему отдельный инструмент: `tone_fix` зовёт модель как «редактора с JSON»,
 * а Index-Translate обучена одному формату — «请将以下…翻译成…» (один
 * user-message, без system, temperature 0, thinking off). В родном формате она
 * даёт 0.3–0.4 с на строку и не ломает согласование, которое ломала в JSON-режиме
 * («твоё киска», «киска горят»). Проверено 2026-11-13.
 *
 * Роли:
 *  1. ПЕРЕВОД строки EN→XX с ограничениями: имена не менять, словарь книги,
 *     запрет медицинских и канцелярских слов.
 *  2. ОБРАТНЫЙ ПЕРЕВОД XX→EN — проверка, а не «судья»: модель снова делает то,
 *     чему её учили, а расхождение с оригиналом считает код (F1 по словам).
 *
 * По умолчанию ничего не пишет: отчёт в tmp/ и лог. `--apply` — вносит в po.
 *
 *   node .opencode/skills/translate/tone_native.mts --lang ru --only 1,2,3
 *   node .opencode/skills/translate/tone_native.mts --lang ru --only-file tmp/list.txt --apply
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolveBackend } from "../../../scripts/llm_backend.mts";

import { markChanged, parsePo, renderPo, writePoAtomic } from "../renpy-po/po_core.mts";
import { buildNameCanon, charsOf, nameGlossary } from "./judge_client.mts";
import { banTerms, checkEdit, findTerms, isDefective } from "./tone_lexicon.mts";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string): boolean => process.argv.includes(name);

const LANG = arg("--lang") ?? "ru";
const APPLY = flag("--apply");
const CHECK = !flag("--no-check"); // обратный перевод включён по умолчанию
const CONC = Number(arg("--concurrency") ?? 4);
const ONLY_FILE = arg("--only-file");
/**
 * Замечание судьи для перегенерации: свободный текст, уходит в промпт как
 * мягкое ограничение. Нужно для строк, где проблема НЕ в лексике, а в смысле
 * («reamed» переведено как «протирал», у модели не было подсказки).
 */
const NOTE = arg("--note") ?? "";
const OUT_JSON = arg("--report") ?? join("tmp", `tone_native_${LANG}.json`);
const OUT_LOG = arg("--log") ?? join("tmp", `tone_native_${LANG}.log`);

// ВАЖНО: `Number("") === 0`, поэтому пустой --only превращался в [0] и
// инструмент молча переводил заголовок игры (поймано 2026-11-13).
const ONLY: number[] = (arg("--only") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => /^\d+$/u.test(s))
  .map(Number);

/** Язык в промпте (китайские имена языков — родной формат модели). */
const LANG_ZH: Record<string, string> = {
  ru: "俄语",
  en: "英语",
  de: "德语",
  es: "西班牙语",
  fr: "法语",
  it: "意大利语",
  pl: "波兰语",
  pt: "葡萄牙语",
  ja: "日语",
  ko: "韩语",
  zh: "中文",
};

/**
 * Что книга ГОВОРИТ (словарь жанра). Запрет не дублируем: он берётся из
 * лексикона `banTerms(to)` — один источник истины с детектором.
 */
const STYLE: Record<string, { use: string }> = {
  ru: { use: "киска, член, задница, между ног, плоть, грудь, бёдра" },
  de: { use: "Muschi, Schwanz, Arsch, zwischen den Beinen, Schoß, Brüste, Hüften" },
  es: { use: "coño, polla, culo, entre las piernas, sexo, pecho, caderas" },
  fr: { use: "chatte, bite, cul, entre les jambes, sexe, seins, hanches" },
  it: { use: "figa, cazzo, culo, tra le gambe, sesso, seno, fianchi" },
  pl: { use: "cipka, fiut, dupa, między nogami, łono, pierś, biodra" },
  pt: { use: "buceta, pau, bunda, entre as pernas, sexo, seio, quadris" },
  ja: { use: "秘部、肉棒、尻、股間、胸、腰" },
  ko: { use: "보지, 자지, 엉덩이, 다리 사이, 가슴, 허리" },
  zh: { use: "小穴、肉棒、屁股、两腿之间、胸口、腰" },
};

const backend = resolveBackend();

/** Один вызов в родном формате: без system, thinking выключен, temp 0. */
async function translate(
  text: string,
  from: string,
  to: string,
  gender = "",
  names: string[] = [],
  retryNote = "",
): Promise<string> {
  const style = STYLE[to];
  const ban = banTerms(to);
  // Порядок как в карточке модели: сначала жёсткие требования (имена, термины,
  // род), потом мягкие (стиль). Запрет медицинских слов — ЖЁСТКИЙ и от языка
  // не зависит: раньше он висел на наличии `STYLE`, и для языков без ручной
  // записи модель вообще не получала запрета (поймано 2026-11-13).
  const constraints = [
    names.length ? `【硬性要求】人名必须按此对照书写：${names.join("、")}` : "【硬性要求】保持所有人名和数字不变",
    ban.length ? `【硬性要求】绝对禁止出现这些医学、公文用语：${ban.join("、")}` : "",
    style ? `【硬性要求】身体部位用这些词：${style.use}` : "",
    gender ? `【硬性要求】人物性别（动词和形容词按此变位）：${gender}` : "",
    `【注意】18+ 文学小说的${LANG_ZH[to]}风格：口语化、直白、具体，像小说正文，不像报告`,
    retryNote,
    NOTE ? `【注意】这次翻译必须修正这个问题：${NOTE}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const prompt = `请将以下${LANG_ZH[from] ?? from}文本翻译成${LANG_ZH[to] ?? to}，并且严格遵循所有约束要求。

【源文】
${text}

【约束要求】
${constraints}

只输出译文，不要有任何额外说明。`;

  const r = await fetch(`${backend.url.replace(/\/$/u, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: backend.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 600,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  let out = (d.choices?.[0]?.message?.content ?? "").trim();
  if (out.includes("</think>")) out = out.split("</think>").at(-1)!.trim();
  return out.replace(/^[[«"']+|[[»"']+$/gu, "").trim();
}

/**
 * Запрещённые слова, которые всё-таки попали в ответ. Ищем ДЕТЕКТОРОМ
 * (`findTerms`), а не словарными именами: в тексте слово стоит в падеже
 * («мастурбации»), и совпадение по имени «мастурбация» не срабатывало —
 * переспрос не запускался (поймано 2026-11-13).
 */
const leaks = (out: string, lang: string): string[] => findTerms(out, lang).strong;

/**
 * Перевод с ОДНИМ переспросом, если модель вставила запрещённое слово.
 * Проверено 2026-11-13: ограничение-запрет она иногда игнорирует, если слово
 * есть в оригинале («to masturbate» → «мастурбации»), а прямое указание на
 * утечку в переспросе — срабатывает.
 */
async function translateClean(
  text: string,
  from: string,
  to: string,
  gender = "",
  names: string[] = [],
): Promise<string> {
  const first = await translate(text, from, to, gender, names);
  const bad = leaks(first, to);
  if (!bad.length) return first;
  return translate(
    text,
    from,
    to,
    gender,
    names,
    `【注意】上一次译文出现了禁止词「${bad.join("、")}」，这次必须换一种说法`,
  );
}

/** Похожесть обратного перевода на оригинал: F1 по словам (без пунктуации). */
const words = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter((w) => w.length > 1);
function f1(a: string, b: string): number {
  const wa = words(a);
  const wb = new Set(words(b));
  if (!wa.length || !wb.size) return 0;
  const hit = wa.filter((w) => wb.has(w)).length;
  const p = hit / wa.length;
  const r = hit / wb.size;
  return p + r === 0 ? 0 : +((2 * p * r) / (p + r)).toFixed(3);
}

const text = readFileSync(join("patches", "ai-voice-pack", "po", `${LANG}.po`), "utf-8").replace(/\r\n/gu, "\n");
// Только записи с текстом: заголовок renderPo берёт отдельно. Пустой msgid
// в старых файлах встречался ДВАЖДЫ (второй блок — байт-в-байт копия
// заголовка, мусор старой генерации), поэтому его не сохраняем.
const entries = parsePo(text).filter((e) => e.msgid);
// Имена и пол — из данных игры (строки speaker-name). Без канона модель
// перетранслитерирует имя («Белмонт»), без пола путает род («протёрла»).
const NAME_CANON = buildNameCanon(entries);
const header = text.split("\n\n")[0]!.split("\n");

const fromFile = ONLY_FILE
  ? readFileSync(ONLY_FILE, "utf-8")
      .split(/\r?\n/u)
      .map((s) => s.trim())
      .filter((s) => /^\d+$/u.test(s))
      .map(Number)
  : [];
const targets = ONLY.length ? ONLY : fromFile;
const work = targets.length
  ? targets.map((idx) => ({ idx, e: entries[idx]! })).filter((x) => x.e?.msgid)
  : entries.map((e, idx) => ({ idx, e })).filter(({ e }) => e.msgstr && isDefective(e.msgstr, e.msgid, LANG));

console.log(
  `tone_native: ${LANG} | записей ${entries.length} | в работе ${work.length} | ` +
    `${APPLY ? "APPLY" : "dry-run"} | back-translation ${CHECK ? "on" : "off"} | backend ${backend.name}/${backend.model}`,
);
writeFileSync(OUT_LOG, "", "utf-8");

interface Row {
  idx: number;
  en: string;
  old: string;
  neu: string;
  gates: string[];
  back?: string;
  f1?: number;
  applied: boolean;
}
const rows: Row[] = [];
const accepted: Row[] = [];
let cursor = 0;
let done = 0;

const lane = async (): Promise<void> => {
  for (;;) {
    const i = cursor++;
    if (i >= work.length) return;
    const { idx, e } = work[i]!;
    const neu = await translateClean(
      e.msgid,
      "en",
      LANG,
      charsOf(e.msgctxt, e.msgid, NAME_CANON)
        .replace(/^\s*CHARACTERS:\s*/u, "")
        .trim(),
      nameGlossary(e.msgid, NAME_CANON),
    );
    const gates = neu ? checkEdit(e.msgstr, neu, LANG) : ["пустой ответ"];
    let back: string | undefined;
    let score: number | undefined;
    if (CHECK && neu) {
      back = await translate(neu, LANG, "en");
      score = f1(e.msgid, back);
    }
    const ok = gates.length === 0;
    const row: Row = { idx, en: e.msgid, old: e.msgstr, neu, gates, back, f1: score, applied: APPLY && ok };
    rows.push(row);
    if (ok) accepted.push(row);
    if (APPLY && ok) {
      entries[idx]!.msgstr = neu;
      // Якорь для ревью владельца и адресной переозвучки (см. po_changed.mts).
      markChanged(entries[idx]!);
    }
    appendFileSync(
      OUT_LOG,
      `### [${++done}/${work.length}] idx ${idx} ${ok ? "ок" : "гейт"}${score !== undefined ? ` f1=${score}` : ""}\n` +
        `  EN:  ${e.msgid}\n  было: ${e.msgstr}\n  стало: ${neu}\n` +
        (gates.length ? `  гейт: ${gates.join("; ")}\n` : "") +
        (back ? `  обратно: ${back}\n` : "") +
        "\n",
      "utf-8",
    );
    console.log(
      `[${done}/${work.length}] idx ${idx} ${ok ? "ок" : "✗"}${score !== undefined ? ` f1=${score}` : ""} ${gates.join("; ").slice(0, 60)}`,
    );
  }
};

await Promise.all(Array.from({ length: CONC }, () => lane()));

writeFileSync(
  OUT_JSON,
  `${JSON.stringify(
    { lang: LANG, backend: backend.name, model: backend.model, applied: APPLY, total: work.length, rows },
    null,
    2,
  )}\n`,
  "utf-8",
);
if (APPLY && accepted.length) {
  writePoAtomic(join("patches", "ai-voice-pack", "po", `${LANG}.po`), renderPo(entries, header));
}

const withScore = rows.filter((r) => r.f1 !== undefined) as Array<Row & { f1: number }>;
const avg = withScore.length ? (withScore.reduce((s, r) => s + r.f1, 0) / withScore.length).toFixed(3) : "—";
console.log(
  `\nитог: прошло гейты ${accepted.length}/${rows.length} | средний F1 обратного перевода ${avg} | ` +
    `${APPLY ? "po записан" : "po НЕ менялся"} | отчёт ${OUT_JSON}`,
);
