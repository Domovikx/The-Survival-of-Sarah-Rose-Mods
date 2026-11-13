/**
 * Единое ревью перевода: все известные классы дефектов по всему po.
 * Печатает находки в формате `[изменено N] [КЛАСС] ...` (совместимо с
 * repair_list.txt → repair_names.mts) и итог «НАЙДЕНО: k» (stderr).
 * Ложные срабатывания отсекаются фильтром HEAD: форма/перевод, который уже был
 * в закоммиченном HEAD, — не брак нашего прогона.
 * Read-only: файлы не меняет. Запуск: node .opencode/skills/translate/translate_review.mts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { parsePo } from "../../../.opencode/skills/renpy-po/po_core.mts";
import { SPEAKER_GENDER } from "../../../patches/ai-voice-pack/casts/gender.mts";

import { buildNameCanon } from "./judge_client.mts";
import { commonRun, contentWords, sharePhrase } from "./review_common_run.mts";

const LANG = process.argv[2] ?? "ru"; // языковой аргумент: node translate_review.mts [lang]
// --all: полная перепроверка корпуса — не фильтруем по HEAD, легаси-дефекты
// тоже ищем (без флага — как раньше: брак только наших прогонов).
const ALL = process.argv.includes("--all");
const PO = `patches/ai-voice-pack/po/${LANG}.po`;
const MIXED = /([а-яё][a-zA-Z]|[a-zA-Z][а-яё])/;

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
const sim = (a: string, b: string): number => 1 - editDist(a, b) / Math.max(a.length, b.length, 1);
const tags = (s: string): string[] => (s.match(/\{[^}]+\}|\[[^\]]+\]/g) ?? []).sort();

const text = readFileSync(PO, "utf-8").replace(/\r\n/g, "\n");
const entries = parsePo(text).filter((e) => e.msgid);
const key = (e: (typeof entries)[number]): string => `${e.msgctxt}\u0000${e.msgid}`;

// HEAD-снимок: что было до наших прогонов — то не считаем браком.
const HEAD_MAP = new Map<string, string>();
try {
  const head = execSync(`git show HEAD:patches/ai-voice-pack/po/${LANG}.po`, { maxBuffer: 64 * 1024 * 1024 }).toString(
    "utf-8",
  );
  for (const he of parsePo(head.replace(/\r\n/g, "\n"))) if (he.msgid) HEAD_MAP.set(key(he), he.msgstr);
} catch {
  /* не git */
}

// Канон имён — общий построитель (judge_client): один источник для всех скриптов.
const NAME_CANON = buildNameCanon(entries);
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

let found = 0;
const hit = (i: number, cls: string, e: (typeof entries)[number], note = ""): void => {
  found++;
  console.log(
    `[изменено ${i}] [${cls}] ${e.msgid.slice(0, 60)} => ${e.msgstr.slice(0, 70)}${note ? ` (${note})` : ""}`,
  );
};

// Ручные решения — ТОЛЬКО для ru: индексы языко-специфичны (для de и др.
// наборы пусты, чтобы не пропускать чужие строки с теми же номерами).
const RU = LANG === "ru";
const ACCEPTED = RU ? new Set([13399, 51493, 64282]) : new Set<number>();
const UTECHKA_ACCEPTED = RU
  ? new Set([
      18130, // заикание в повторе реплики — см. ниже
      29152, // риторический эхо-перифраз: Сара «не пришла сюда» ↔ Разафель «разве ты не пришла» — верный перевод
      31001, // «с каждым толчком» = «with each thrust» — EN-соседи действительно делят эту фразу
      25371, // «которые она могла вынести» = «that she could endure/survive» — EN-соседи делят конструкцию намеренно
    ])
  : new Set<number>();

// Регистр-исключения: строки, где HEAD содержал ошибочный смешанный
// регистр (вы+ты в одной реплике), а правка привела сцену к «ты» (по
// соседним репликам спикера). Только ru, индексы языко-специфичны.
const REG_ACCEPTED = RU ? new Set([17537, 45021]) : new Set<number>();

entries.forEach((e, i) => {
  const tr = e.msgstr;
  if (!tr || e.msgctxt === "speaker-name") return;
  const head = HEAD_MAP.get(key(e)) ?? "";

  // 1. Утечка соседней строки (дубль или содержательное совпадение).
  for (const n of [entries[i - 1], entries[i + 1]]) {
    if (!n || !n.msgstr || !n.msgid || n.msgid === e.msgid || n.msgctxt === "speaker-name") continue;
    const sameOrigin = sharePhrase(e.msgid, n.msgid);
    const dup =
      !sameOrigin &&
      tr.length >= 20 &&
      n.msgstr.length >= 20 &&
      sim(tr, n.msgstr) > 0.75 &&
      sim(e.msgid, n.msgid) < 0.6;
    // glue — только при РАЗНЫХ оригиналах: дубликаты строк в игре (одинаковые
    // msgid с точкой/без) законно переводятся одинаково. sameOrigin (оригиналы
    // делят фразу ≥3 слов) исключает префикс-расширение реплики — E2E 2026-11-09.
    const glue = !sameOrigin && n.msgstr.length >= 20 && tr.includes(n.msgstr) && sim(e.msgid, n.msgid) < 0.6;
    // Вклейка ЧАСТИ соседа (второе предложение из соседней строки): общий
    // словесный фрагмент, которого нет в оригиналах. Пороги калиброваны на ru
    // (E2E 2026-11-06): стоп-словa русские → на других языках просто порог
    // по длине фрагмента (без contentWords).
    const run = commonRun(tr, n.msgstr);
    const rw = run ? run.split(" ").length : 0;
    const glued = run && (LANG === "ru" ? rw >= 3 && contentWords(run) >= 2 : rw >= 4) && !sameOrigin;
    // Утечка — только если так было НЕ в HEAD (иначе легаси, его не трогаем).
    if ((dup || glue || glued) && (ALL || tr !== head) && !UTECHKA_ACCEPTED.has(i)) {
      hit(i, "УТЕЧКА", e, glued && !dup && !glue ? `вклейка соседа: «${run}»` : "");
      break;
    }
  }

  // 2. Скобочные формы рода («прав(а)») — художественный текст их не пишет.
  if (/\([а-яё]{1,8}\)/.test(tr) && !/\([a-zA-Zа-яё]{1,8}\)/.test(e.msgid) && (ALL || !/\([а-яё]{1,8}\)/.test(head)))
    hit(i, "СКОБКИ-РОДА", e);

  // 2b. Потерянное отрицание (HEAD сохранил, наш перевод — нет маркеров).
  const ruNeg = (s: string): boolean =>
    /(?<![а-яёА-ЯЁ])не(?![а-яёА-ЯЁ])|(?<![а-яёА-ЯЁ])не(?=[а-яё])|(?<![а-яёА-ЯЁ])ни|(?<![а-яёА-ЯЁ])без(?![а-яёА-ЯЁ])|отсутств/i.test(
      s,
    );
  // В --all отрицание НЕ проверяем: EN-маркеры дают ~90% ложных на идиомном
  // парафразе («Not long after» → «Вскоре»), семантику покрывает судья (2026-11-06).
  if (
    /\b(?:not|nobody|nothing|none|never|cannot|can't|don't|doesn't|didn't|won't|wouldn't|couldn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|no)\b/i.test(
      e.msgid,
    ) &&
    tr !== head &&
    !ruNeg(tr) &&
    ruNeg(head)
  )
    hit(i, "ОТРИЦАНИЕ", e);

  // 2c. Регистр: ты↔вы против HEAD — смена обращений (устойчивость отношений).
  const famTy = (s: string): boolean =>
    /(?<![а-яёА-ЯЁ])ты(?![а-яёА-ЯЁ])|(?<![а-яёА-ЯЁ])теб|(?<![а-яёА-ЯЁ])тво/i.test(s);
  const famVy = (s: string): boolean =>
    /(?<![а-яёА-ЯЁ])вы(?![а-яёА-ЯЁ])|(?<![а-яёА-ЯЁ])вам|(?<![а-яёА-ЯЁ])вас|(?<![а-яёА-ЯЁ])ваш/i.test(s);
  if (
    head &&
    tr !== head &&
    !REG_ACCEPTED.has(i) &&
    ((famTy(tr) && !famVy(tr) && famVy(head)) || (famVy(tr) && !famTy(tr) && famTy(head)))
  )
    hit(i, "РЕГИСТР", e);

  // 3. Название игры переведено (головная строка; если HEAD тоже переводил — не трогаем).
  if (
    e.msgid.includes("The Survival of Sarah Rose") &&
    !tr.includes("The Survival of Sarah Rose") &&
    (ALL || tr !== head)
  )
    hit(i, "НАЗВАНИЕ", e);

  // 3b. Дрейф названия места: по корпусу «Розанна» (HEAD-«Росанн» не трогаем).
  if (/\bRosanna\b/.test(e.msgid) && /Росанн/.test(tr) && (ALL || !/Росанн/.test(head))) hit(i, "МЕСТО", e);

  // 4. Метка развернулась в предложение (слова со строчной буквы).
  const srcWords = e.msgid.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  if (srcWords.length >= 1 && srcWords.length <= 6 && srcWords.every((w) => w[0] !== w[0].toLowerCase())) {
    const words = tr.split(/[^а-яёА-ЯЁ]+/).filter(Boolean);
    const lower = words.filter((w) => w.length >= 2 && w[0] === w[0].toLowerCase() && w[0] !== w[0].toUpperCase());
    if (lower.length > 2 && (ALL || tr !== head)) hit(i, "МЕТКА", e);
  }

  // 5. Смешанные алфавиты.
  if (MIXED.test(tr) && !MIXED.test(e.msgid)) hit(i, "СКРИПТ", e);

  // 6. Имена: искажения (не из HEAD) и женский род при мужском имени.
  const words = tr.match(/[А-ЯЁ][а-яё]+/g) ?? [];
  for (const [enName, canon] of NAME_CANON) {
    if (!e.msgid.includes(enName)) continue;
    for (const cw of canon.split(" ")) {
      if (cw.length < 4) continue;
      for (const w of words) {
        if (w === cw || w.startsWith(cw) || w.startsWith(cw.slice(0, -1))) continue;
        if (CANON_WORDS.has(w) || NAME_STOP.has(w)) continue; // другое имя или общее слово
        if (cw.includes(w)) continue; // короткая форма полного имени (Ая ← Аяка)
        if ([...CANON_WORDS].some((c) => c.length >= 4 && w.startsWith(c))) continue; // склонение ДРУГОГО имени (Сакара ← Сакар)
        if (w.length >= 5 && cw.length >= 5 && w.startsWith(cw.slice(0, -2))) continue; // падежная форма (Торговца ← Торговец, Старого ← Старый)
        const d = editDist(w, cw);
        if (d > 3) continue;
        if (d === 3 && !w.startsWith(cw.slice(0, 3))) continue; // d≤2 всегда, d=3 с префиксом
        if (!ALL && head.includes(w)) continue; // форма уже была в HEAD — не брак
        hit(i, "ИМЯ", e, `«${w}» ≠ «${cw}»`);
        break;
      }
      if (SPEAKER_GENDER[enName] === "M") {
        const fem = new RegExp(`\\b${cw}\\s+(?:[а-яё]+\\s+){0,2}[а-яё]+ла[сь]?\\b`).exec(tr);
        if (fem && (ALL || !head.includes(fem[0]))) hit(i, "РОД", e, fem[0]);
      }
    }
  }

  // 7. Разметка: потеряна или чужая.
  const st = tags(e.msgid);
  const tt = tags(tr);
  const missing = st.filter((t) => !tt.includes(t));
  const foreign = tt.filter((t) => !st.includes(t));
  if ((missing.length || foreign.length) && (ALL || tr !== head))
    hit(i, "РАЗМЕТКА", e, [...missing.map((t) => `нет:${t}`), ...foreign.map((t) => `чуж:${t}`)].join(" "));

  // 7b. %-спецификаторы: КОЛИЧЕСТВО должно совпадать с EN (тип/пробелы
  // допустимы — языки пишут %d/%s по-разному; критично число: Python/Ren'Py
  // падает TypeError при несовпадении — найдено e2e-генерацией tl 2026-11-08:
  // ja/zh потеряли по одному %d в галерее, de/es заменили [config]/{} на %s).
  const specCount = (s: string): number =>
    (s.match(/%(?:\d+\$)?[-+ #0']*(?:\d+|\*)?(?:\.(?:\d+|\*))?[hlL]?[diouxXeEfFgGaAcspn]/g) ?? []).length;
  if (specCount(e.msgid) !== specCount(tr)) hit(i, "СПЕЦИФИКАТОР", e, `${specCount(e.msgid)}→${specCount(tr)}`);

  // 8. Сломанное экранирование: обратный слэш не перед n/t/кавычкой («\Л» вместо «\n»).
  if (/\\[^nrt"\\]/.test(tr) && !/\\[^nrt"\\]/.test(e.msgid)) hit(i, "ЭКРАНИРОВАНИЕ", e);

  // 9. Речь, вклеенная в короткую наррацию-атрибуцию (дубль в игре: реплика
  // показывается отдельной строкой). Легаси-баг, найден и вычищен 2026-11-04.
  // ACCEPTED — осознанно оставленные: у этих строк нет отдельной строки-носителя.
  if (
    !ACCEPTED.has(i) &&
    e.msgctxt === "speaker:Narrator" &&
    e.msgid.split(/\s+/).length <= 5 &&
    /: «/.test(tr) &&
    !/: «/.test(e.msgid)
  )
    hit(i, "РЕЧЬ-В-НАРРАЦИИ", e);
});

console.error(`НАЙДЕНО: ${found}`);
