/**
 * translate_salvage.mts — спасение строк, чей текст вклеился в соседнюю.
 *
 * Когда модель дописывает следующую реплику, строка i остаётся ПУСТОЙ, а её текст
 * уже лежит в переводе строки i-1. Обычный прогон в такой ситуации буксует: в
 * контексте он «видит», что реплика уже переведена.
 *
 * Здесь строка переводится ОДИН-В-ОДИН: только EN-строка (без соседей, без
 * сцены) + пол спикера. Поэтому склейка физически невозможна.
 *
 * Режимы:
 *   (без флагов)          — все ПУСТЫЕ строки;
 *   --indices <файл>      — заданные индексы (1 на строку) даже если заполнены;
 *                           так лечатся уже склеенные строки, которые обычный
 *                           --retrans не берёт (гейт вклейки видит грязного соседа).
 *
 * Запуск (из корня репы):
 *   node .opencode/skills/translate/translate_salvage.mts es [--limit 100] [--apply]
 *   node .opencode/skills/translate/translate_salvage.mts es --indices tmp/fix.txt --apply
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SPEAKER_GENDER } from "../../../patches/ai-voice-pack/casts/gender.mts";
import { parsePo, renderPo, writePoAtomic } from "../renpy-po/po_core.mts";
import { commonRun, sharePhrase } from "./review_common_run.mts";

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

const args = process.argv.slice(2);
const LANG = args[0] ?? "es";
const APPLY = args.includes("--apply");
const limitAt = args.indexOf("--limit");
const LIMIT = limitAt >= 0 ? Number(args[limitAt + 1]) : 0;
const indicesAt = args.indexOf("--indices");
const INDICES = indicesAt >= 0 ? args[indicesAt + 1] : undefined;
const URL = process.env.TSSR_LLM_URL ?? "http://127.0.0.1:8081";
const MODEL = process.env.TSSR_LLM_MODEL ?? "index-translate-9b";
// Путь переопределяем: E2E-тест гоняет тот же код на синтетическом po
// (иначе проверка «лечит ли салваж склейки» невозможна без порчи живого файла).
const PO = process.env.TSSR_SALVAGE_PO ?? join("patches", "ai-voice-pack", "po", `${LANG}.po`);

const text = readFileSync(PO, "utf-8").replace(/\r\n/g, "\n");
// Индексы — как у translate_run/translate_review: шапка po отброшена (msgid ""),
// иначе весь список ремонта съезжает на один (готча 2026-11-16).
const entries = parsePo(text).filter((e) => e.msgid);
const header = text.split("\n\n")[0].split("\n");

const SYSTEM =
  `You translate this game into ${TARGET[LANG] ?? LANG}. Translate ONLY the given line. ` +
  `Output the translation and nothing else: no quotes, no explanations, no speaker name, no extra sentences.`;

const translate = async (line: string, speaker: string | null, gender: string | null): Promise<string> => {
  // Только пол спикера: этого хватает для рода/обращений, и он НЕ тянет за собой
  // соседний текст (именно соседи на входе и провоцировали склейку).
  const hint = speaker && gender ? `[speaker: ${speaker}, ${gender === "F" ? "female" : "male"}]\n` : "";
  const r = await fetch(`${URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `${hint}${line}` },
      ],
      temperature: 0,
      max_tokens: 500,
      reasoning_effort: "none",
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (data.choices?.[0]?.message?.content ?? "")
    .trim()
    .replace(/^["«“]|["»”]$/g, "")
    .trim();
};

const CYRILLIC = /[а-яёА-ЯЁ]{2,}/;
const EN_STOP = /\b(the|and|you|she|her|his|that|was|for|not|with|have|would|could)\b/i;

/**
 * Порог «вклейки соседа» для не-ru языков — 6 слов: на романских/германских
 * языках 4-словные совпадения сплошь естественные коллокации (калибровка
 * `translate_review` 2026-11-16).
 */
const GLUE_WORDS = 6;
/** Сколько раз текст «переехал» из испорченного соседа в свою строку. */
let moved = 0;

/**
 * Гейт результата. Проверка соседей обязательна: модель при temp0 регулярно
 * отдаёт перевод СОСЕДНЕЙ строки, и без этой проверки склейка записывается
 * молча (инцидент 2026-11-17: 124 «спасённые» строки de получили текст соседа,
 * поймано механическим ревью). Логика — та же, что у `translate_review`:
 * общий словесный фрагмент считает `commonRun` (единый детектор).
 */
const acceptable = (source: string, translated: string, at: number): string | null => {
  if (!translated) return "пусто";
  if (translated.includes("\n")) return "многострочно";
  if (LANG !== "ru" && CYRILLIC.test(translated)) return "русский текст";
  if (LANG !== "en" && EN_STOP.test(translated) && !EN_STOP.test(source)) return "английский текст";
  if (translated.length > source.length * 3 + 40) return "подозрительно длинно (склейка)";
  for (const j of [at - 1, at + 1]) {
    const n = entries[j];
    if (!n || !n.msgstr.trim()) continue;
    // Одинаковые оригиналы (префикс-расширение реплики) — законное совпадение.
    if (sharePhrase(source, n.msgid)) continue;
    // ТОЧНОЕ совпадение с соседом — не повод отклонить: сосед обычно и хранит
    // перевод ЭТОЙ строки (сдвиг на одну при генерации). Принимаем кандидата и
    // возвращаем соседа в «пустые», чтобы его перевели по его оригиналу
    // (поймано 2026-11-18 на fr: 214 отказов «перевод соседа», язык стоял часами).
    if (n.msgstr.trim() === translated.trim()) {
      entries[j] = { ...n, msgstr: "" };
      moved++;
      return null;
    }
    // Наш перевод вклеен в соседа (сосед = свой текст + наш) — отрезаем кусок у
    // соседа, не теряя его собственный текст. Проверяем ДО порога по словам:
    // иначе короткий кандидат («Ligne collée en queue.») проходил мимо и сосед
    // навсегда оставался с вклеенной копией (поймано E2E 2026-11-18).
    const cand = translated.trim();
    if (cand.length >= 20 && n.msgstr.includes(cand)) {
      const trimmed = n.msgstr.replace(cand, "").replace(/\s+/g, " ").trim();
      entries[j] = { ...n, msgstr: trimmed };
      moved++;
      return null;
    }
    const run = commonRun(translated, n.msgstr);
    const runWords = run ? run.split(" ").length : 0;
    const nWords = n.msgstr.trim().split(" ").length;
    if (runWords >= GLUE_WORDS) {
      // Наш перевод СОДЕРЖИТ перевод соседа почти целиком (≥60 % его слов) →
      // сосед хранит НАШУ строку (сдвиг с хвостом). Принимаем и очищаем соседа,
      // иначе гейт запирает починку навсегда (2026-11-18, fr).
      if (n.msgstr.trim().length >= 20 && (translated.includes(n.msgstr.trim()) || runWords >= nWords * 0.6)) {
        entries[j] = { ...n, msgstr: "" };
        moved++;
        return null;
      }
      return `вклейка соседа #${j}: «${run}»`;
    }
  }
  return null;
};

const pending: number[] = [];
if (INDICES) {
  for (const raw of readFileSync(INDICES, "utf-8").split(/\s+/)) {
    // filter(Boolean) обязателен: хвостовой перевод строки давал Number("") = 0,
    // и нулевая строка po перезаписывалась в каждом прогоне (готча 2026-11-16).
    if (!raw) continue;
    const i = Number(raw);
    if (Number.isInteger(i) && i >= 0 && i < entries.length && entries[i]!.msgid) pending.push(i);
  }
} else {
  entries.forEach((e, i) => {
    if (e.msgid && !e.msgstr.trim()) pending.push(i);
  });
}
const work = LIMIT ? pending.slice(0, LIMIT) : pending;
console.log(
  `${LANG}: ${INDICES ? `по списку ${pending.length}` : `пустых ${pending.length}`}, к спасению ${work.length}${APPLY ? "" : " (dry-run)"}`,
);

let done = 0;
let failed = 0;
for (const i of work) {
  const e = entries[i]!;
  const speaker = e.msgctxt?.startsWith("speaker:") ? e.msgctxt.slice(8).replace(/^"|"$/g, "") : null;
  const gender = speaker ? (SPEAKER_GENDER[speaker] ?? null) : null;
  const candidate = await translate(e.msgid, speaker, gender);
  const problem = acceptable(e.msgid, candidate, i);
  if (problem) {
    failed++;
    console.log(`  сбой #${i}: ${problem}`);
    continue;
  }
  entries[i] = { ...e, msgstr: candidate };
  if (!APPLY) console.log(`  #${i} ${e.msgid.slice(0, 70)} => ${candidate.slice(0, 70)}`);
  done++;
  if (APPLY && done % 50 === 0) {
    writePoAtomic(PO, renderPo(entries, header));
    console.log(`  … ${done}/${work.length}`);
  }
}
if (APPLY) writePoAtomic(PO, renderPo(entries, header));
console.log(
  `${LANG}: переведено ${done}, сбоев ${failed}, текст возвращён из соседей ${moved}${APPLY ? " (записано)" : " (dry-run)"}`,
);
