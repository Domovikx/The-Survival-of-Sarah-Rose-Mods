/**
 * tmp/po_exp.mts — стенд подбора модели/конфига локальной LLM для перевода es.po.
 *
 * Тестирует матрицу конфигов (модель / thinking / temperature / few-shot / retry)
 * на контрольной пачке записей PO, прогоняет автоматические чеки качества,
 * судит переводы второй моделью и печатает сравнительную таблицу + образцы.
 *
 * ЗАПУСК (из корня репы, LM Studio поднят на 127.0.0.1:1234):
 *   node tmp/po_exp.mts --configs A,B,D,E --start 8950 --n 12
 *
 * Флаги:
 *   --configs A,B,...   какие конфигы гонять (см. CONFIGS ниже); все — по умолчанию
 *   --start N           первая строка окна поиска непереведённых записей
 *   --n N               размер тестовой пачки (8 подряд + 4 с 18+ ключевыми словами)
 *   --model NAME        переопределить модель ВСЕХ конфигов (бенчмарк кандидатов)
 *   --test-from FILE    взять тестовую пачку (mid) из results-файла — честное
 *                       сравнение моделей на ОДНИХ и тех же записях
 *   --judge-only FILE   НЕ переводить: прогнать кросс-судью (qwen) по rows
 *                       готового results-файла (переводила кандидат-модель)
 *   --no-judge          без судьи на этапе перевода
 *   --out FILE          куда писать json с результатами (по умолчанию tmp/po_exp_results.json)
 *
 * Эмоция берётся из POT-резолвера (DRY 2026-10-23: в po/*.po комментариев нет).
 */
import { readFileSync, writeFileSync } from "node:fs";

import { loadPotIndex } from "../.opencode/skills/renpy-po/pot_resolve.mts";

// ---------- CLI ----------
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const BASE = flag("base-url") ?? "http://127.0.0.1:1234";
const PO_PATH = "patches/ai-voice-pack/po/es.po";
const QWEN = "qwen/qwen3.5-9b";
const MIMO = "mimo-v2.6-distill-qwen-9b";

// ---------- PO ----------
interface PoEntry {
  line: number; // строка msgstr в файле
  emo: string | null;
  ctx: string | null;
  mid: string;
  mstr: string;
}

function parsePo(path: string): PoEntry[] {
  const lines = readFileSync(path, "utf-8").split("\n");
  const out: PoEntry[] = [];
  let emo: string | null = null;
  let ctx: string | null = null;
  let mid: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("#. emotion:")) emo = l.slice(11).trim();
    else if (l.startsWith("msgctxt ")) {
      ctx = l.slice(8);
      mid = null;
    } else if (l.startsWith("msgid ")) mid = l.slice(6);
    else if (l.startsWith("msgstr ")) {
      out.push({ line: i + 1, emo, ctx, mid: mid ?? "", mstr: l.slice(7) });
      emo = null;
      ctx = null;
      mid = null;
    }
  }
  return out;
}

const unq = (s: string): string => s.replace(/^"|"$/g, "");

// ---------- ЛLM ----------
interface ChatMsg {
  role: "system" | "user";
  content: string;
}

interface CallOpts {
  model: string;
  effort?: "none" | "low" | "medium";
  temp: number;
  maxTokens: number;
}

async function chat(messages: ChatMsg[], o: CallOpts, tries = 3): Promise<string> {
  const body: Record<string, unknown> = {
    model: o.model,
    messages,
    temperature: o.temp,
    max_tokens: o.maxTokens,
    stream: false,
  };
  if (o.effort) body.reasoning_effort = o.effort; // LM Studio: enableThinking=false НЕ работает (баг #1990), работает reasoning_effort
  let lastErr = "";
  for (let a = 0; a < tries; a++) {
    try {
      const r = await fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
      const d = (await r.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: unknown;
      };
      const c = d.choices?.[0]?.message?.content ?? "";
      if (!c.trim()) throw new Error("пустой content (thinking съел токены?)");
      return c.trim();
    } catch (e) {
      lastErr = String(e);
      await new Promise((s) => setTimeout(s, 2000 * (a + 1)));
    }
  }
  throw new Error(`LLM не ответила: ${lastErr}`);
}

/** Достаёт JSON-объект из ответа модели (первая {...}-последовательность). */
function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ---------- Промпт-система ----------
const FEWSHOT: Array<{ emo: string; ctx: string; mid: string; es: string }> = [
  {
    emo: "Intrigued and tenderly curious",
    ctx: '"speaker:Narrator"',
    mid: "A complicated flurry of emotions rocked her body as she began to slowly finger herself.",
    es: "Un complicado torbellino de emociones sacudió su cuerpo mientras comenzaba a masturbarse lentamente con los dedos.",
  },
  {
    emo: "Sternly condemning",
    ctx: '"speaker:Sarah"',
    mid: "A cock hungry slut...pretending to be a deck hand.",
    es: "Una zorra hambrienta de polla... fingiendo ser marinera.",
  },
  {
    emo: "In a chilling, mournful tone",
    ctx: '"speaker:Narrator"',
    mid: "A blood-curdling scream rings out across the silenced mass of slaves.",
    es: "Un grito desgarrador resuena sobre la masa enmudecida de esclavos.",
  },
  {
    emo: "Surprised curiosity",
    ctx: '"speaker:Captain Belmont"',
    mid: "A cheap ship whore who will suck my dick the moment I order her to?",
    es: "¿Una puta barata de barco que me chupará la polla apenas le dé la orden?",
  },
];

function systemPrompt(fewshot: boolean): string {
  const rules = `You are a senior literary translator localizing the adult visual novel "The Survival of Sarah Rose" from English into neutral Spanish (one file serves BOTH Spain and Latin America).

HARD RULES:
- Output STRICT JSON only: {"es":"<translation>"}. No commentary, no explanations.
- Translate ONLY the final user line (the msgid). The preceding quoted lines are scene context — do NOT translate them.
- Address form: "tú" everywhere between lovers/friends/family/servants; "usted" ONLY for subjects addressing monarchs/high lords/priests (Su Majestad, su señoría). NEVER "vos"/voseo, NEVER "vosotros" — plural "you" is always "ustedes".
- Vocabulary must be neutral for both Spain and LatAm (prefer "computadora"). FORBIDDEN words: "coger", "concha", "usteded".
- Gender agreement is CRITICAL: adjectives/participles/nicknames agree with the subject. Sarah is FEMALE (avergonzada, cansada, una borracha, como una niña). Determine the subject from the speaker name and the pronouns in the English line.
- Adult register: the game is explicit EROTIC PROSE, not medicine. Keep it frank, never soften or euphemize, never skip erotic content.
  FORBIDDEN in scenes: "penetrar", "pene", "vagina" (except lines by doctors/scientists).
  Lexicon: pussy->"coño" (scene) / "entre sus piernas" (soft narration); cunt->ALWAYS "coño" (anatomy, even as insult, never "puta"); cock/dick->"polla" / "verga" (harsher) / "miembro" (elevated narration); balls->"huevos" / "cojones"; tits->"tetas"(crude)/"pechos"(neutral)/"senos"(elevated); ass->"culo"(crude)/"trasero"(soft); whore->"puta"; slut->"zorra"(ES)/"puta"; fuck(v)->"follar"; fuck!(exclamation/shout)->"¡Joder!"/"¡Carajo!" (NOT "¡Mierda!"); cum->"leche"/"semilla"/"semen" (never "líquido seminal"); wet->"mojada"/"empapada".
  "between her legs"->"entre sus piernas" (NEVER "entre sus muslos"). Use ONE term per scene; vary synonyms ACROSS scenes.
- Names are never translated ("King Orwell"->"el rey Orwell", but keep "Orwell").
- Length: within ±30% of the English line (lines are subtitles). Keep "..." as "...", keep repeated words and exclamations. Do not lose concreteness (slowly->lentamente, possessives->"de X", locations intact).
- Idioms, not literal: "gave in"->"cedió", "dug into"->"se clavaba".
- The emotion tag gives the narrator's delivery (Whispering, afraid = whispered; In a burst of passion = a cry). Tone fidelity outranks literalness.
- NEVER wrap the line in quotation marks: the game renders speech on screen, and the English source has no quotes. Use quotes ONLY where the English itself quotes something inside the text (mirror it). Keep any %s/{name} placeholders verbatim.
- Natural Spanish word order — never mirror English syntax mechanically.`;

  const shots = fewshot
    ? `\n\nSTYLE EXAMPLES (same format — emotion, speaker, English, your JSON):\n` +
      FEWSHOT.map(
        (f) =>
          `emotion: ${f.emo}\nspeaker: ${f.ctx}\nEN: ${f.mid}\nJSON: {"es":"${f.es}"}`,
      ).join("\n\n")
    : "";
  return rules + shots;
}

const USER_TMPL = (prev: string[], e: PoEntry, next: string[]): string =>
  [
    ...(prev.length ? [`CONTEXT (previous lines):`, ...prev, ""] : []),
    `emotion: ${e.emo ?? "Curiously observing"}`,
    `speaker: ${e.ctx ?? '"speaker:Narrator"'}`,
    `EN: ${e.mid}`,
    ...(next.length ? ["", `CONTEXT (following lines):`, ...next] : []),
  ].join("\n");

// ---------- Чеки качества ----------
const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bpenetr(ar|ó|a|ando|ada|ado)\b/i, "клинический penetrar"],
  [/\bpene\b/i, "клинический pene"],
  [/\bvagina\b/i, "клинический vagina"],
  [/\bconcha\b/i, "латино-мин concha"],
  [/\bcoger\b/i, "латино-мин coger"],
  [/\bvosotros\b/i, "ES-форма vosotros"],
  [/\busteded\b/i, "опечатка usteded"],
  [/\btestículos\b/i, "клинический testículos"],
  [/entre (sus|sus propios) muslos/i, "muslos вместо piernas"],
];

function checkEntry(e: PoEntry, es: string): string[] {
  const issues: string[] = [];
  if (!es.trim()) issues.push("пустой перевод");
  if (es === unq(e.mid)) issues.push("msgstr == msgid (не переведено)");
  for (const [re, why] of FORBIDDEN) if (re.test(es)) issues.push(why);
  const midLen = unq(e.mid).length;
  const ratio = midLen ? es.length / midLen : 1;
  if (ratio < 0.5 || ratio > 1.6) issues.push(`длина ×${ratio.toFixed(2)} вне 0.5–1.6`);
  if (/%[sd]/.test(unq(e.mid)) && !/%[sd]/.test(es)) issues.push("потерян плейсхолдер %s/%d");
  // Кавычки: игра рисует речь экраном, английский оригинал их не ставит —
  // добавленные « » или " " ломают стиль (ru.po/es.po: реплики без кавычек).
  const midTrim = unq(e.mid).trim();
  const esTrim = es.trim();
  const midStartsQuoted = /^["«]/.test(midTrim);
  if (!midStartsQuoted && /^["«]/.test(esTrim)) issues.push("добавлены кавычки к реплике (оригинал без них)");
  return issues;
}

// ---------- Судья ----------
const JUDGE_PROMPT = `You are a strict localization QA reviewer for an adult visual novel (EN->ES, neutral Spanish for Spain+LatAm). Judge the candidate translation against the English source, speaker gender, and emotion tag.

Score 0-10 and list issues. Check: completeness (nothing dropped/added), tone fidelity to the emotion tag, gender agreement (Sarah is FEMALE), erotic register (frank prose, NO clinical "penetrar/pene/vagina", "cunt"="coño" anatomy not insult, "fuck!"shout="¡Joder!" not "¡Mierda!"), neutral Spanish (tú, ustedes, no vosotros, no "coger"/"concha"), naturalness (not stilted, no Anglicisms), length (subtitles ±30%).

Output STRICT JSON only: {"score":<0-10 int>,"issues":["...", ...]}. Keep each issue SHORT (max 12 words), max 3 issues; use [] if perfect. Do not add any text outside the JSON.`;

async function judge(model: string, e: PoEntry, es: string): Promise<{ score: number; issues: string[] }> {
  const user = `emotion: ${e.emo ?? "-"}\nspeaker: ${e.ctx ?? "-"}\nEN: ${unq(e.mid)}\nES candidate: ${es}`;
  const raw = await chat(
    [
      { role: "system", content: JUDGE_PROMPT },
      { role: "user", content: user },
    ],
    { model, effort: "none", temp: 0.1, maxTokens: 900 },
  );
  const j = extractJson(raw);
  if (!j) {
    // Фолбэк: судья обрезал JSON — вытаскиваем score как есть, issues помечаем.
    const m = /"score"\s*:\s*(\d+)/.exec(raw);
    if (m) return { score: Number(m[1]), issues: ["судья вернул битый JSON (обрезка) — issues потеряны"] };
    return { score: -1, issues: [`судья не вернул JSON: ${raw.slice(0, 80)}`] };
  }
  return { score: Number(j.score ?? -1), issues: Array.isArray(j.issues) ? (j.issues as string[]) : [] };
}

// ---------- Конфиги ----------
interface Cfg {
  name: string;
  model: string;
  effort?: "none" | "low" | "medium";
  temp: number;
  fewshot: boolean;
  retryFeedback: boolean;
  desc: string;
}

const CONFIGS: Record<string, Cfg> = {
  A: { name: "A", model: QWEN, effort: "none", temp: 0.3, fewshot: true, retryFeedback: true, desc: "qwen thinking-off, few-shot, retry+feedback" },
  B: { name: "B", model: QWEN, effort: "low", temp: 0.3, fewshot: true, retryFeedback: true, desc: "qwen thinking-low, few-shot, retry+feedback" },
  C: { name: "C", model: MIMO, effort: "none", temp: 0.3, fewshot: true, retryFeedback: true, desc: "mimo thinking-off, few-shot, retry+feedback" },
  D: { name: "D", model: QWEN, effort: "none", temp: 0.1, fewshot: true, retryFeedback: true, desc: "qwen temp 0.1 (холоднее)" },
  E: { name: "E", model: QWEN, effort: "none", temp: 0.3, fewshot: false, retryFeedback: true, desc: "qwen БЕЗ few-shot (ценность шотов)" },
  F: { name: "F", model: QWEN, effort: "none", temp: 0.3, fewshot: true, retryFeedback: false, desc: "qwen без retry (ценность чеков)" },
};

// ---------- Перевод одной записи ----------
async function translateEntry(e: PoEntry, ctxLines: { prev: string[]; next: string[] }, c: Cfg): Promise<{ es: string; tries: number }> {
  const msgs: ChatMsg[] = [
    { role: "system", content: systemPrompt(c.fewshot) },
    { role: "user", content: USER_TMPL(ctxLines.prev, e, ctxLines.next) },
  ];
  let feedback = "";
  const tries = c.retryFeedback ? 3 : 1;
  for (let t = 0; t < tries; t++) {
    const raw = await chat(msgs, {
      model: c.model,
      effort: c.effort,
      temp: c.temp,
      // thinking-конфигам нужен щедрый бюджет: reasoning_tokens копятся в
      // max_tokens и при нехватке content остаётся пустым (баг LM Studio).
      maxTokens: c.effort ? 5000 : 700,
    });
    const j = extractJson(raw);
    const es = j && typeof j.es === "string" ? (j.es as string).trim() : "";
    const issues = checkEntry(e, es);
    if (es && issues.length === 0) return { es, tries: t + 1 };
    if (t === tries - 1) return { es, tries: t + 1 };
    feedback = `\n\nYour previous answer was rejected: ${issues.join("; ") || "invalid JSON"}. Fix and output JSON only.`;
    msgs[1] = { role: "user", content: USER_TMPL(ctxLines.prev, e, ctxLines.next) + feedback };
  }
  return { es: "", tries };
}

// ---------- main ----------
async function main() {
  const startLine = Number(flag("start") ?? 8950);
  const nTotal = Number(flag("n") ?? 12);
  const want = (flag("configs") ?? "A,B,C,D,E,F").split(",").map((s) => s.trim());
  const useJudge = !argv.includes("--no-judge");
  const outPath = flag("out") ?? "tmp/po_exp_results.json";
  const modelOverride = flag("model"); // переопределить модель всех конфигов
  const testFrom = flag("test-from"); // та же тестовая пачка, что в results-файле
  const judgeOnly = flag("judge-only"); // НЕ переводить: судить готовые rows кросс-моделью

  const entries = parsePo(PO_PATH);
  // DRY (2026-10-23): в es.po больше нет комментариев — тон из POT-резолвера.
  const pot = loadPotIndex();
  const stripQ = (s: string): string => s.replace(/^"|"$/g, "");
  for (const e of entries) e.emo = pot.emotion(stripQ(e.ctx ?? ""), unq(e.mid)) ?? e.emo;
  const byMid = new Map<string, PoEntry>();
  for (const e of entries) if (!byMid.has(unq(e.mid))) byMid.set(unq(e.mid), e);

  // ---- режим кросс-судьи: переводила МОДЕЛЬ X, судит qwen ----
  if (judgeOnly) {
    const src = JSON.parse(readFileSync(judgeOnly, "utf-8")) as {
      results: Array<{ config: string; desc?: string; rows: Array<{ line: number; mid: string; es: string }>; judge?: unknown[] }>;
    };
    console.log(`КРОСС-СУДЬЯ ({QWEN}) -> ${judgeOnly} (${src.results.length} конфигов)`);
    for (const r of src.results) {
      const jrows: Array<{ line: number; score: number; issues: string[] }> = [];
      for (const row of r.rows) {
        const e = byMid.get(row.mid);
        if (!e || !row.es) continue;
        try {
          const j = await judge(QWEN, e, row.es);
          jrows.push({ line: row.line, score: j.score, issues: j.issues });
        } catch (err) {
          console.error(`  судья сбой [${row.line}]: ${String(err).slice(0, 120)}`);
        }
      }
      r.judge = jrows;
      const sc = jrows.map((x) => x.score).filter((x) => x >= 0);
      const avg = sc.length ? (sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(2) : "-";
      console.log(`  ${r.config}: оценено ${sc.length}, средний балл ${avg}`);
    }
    writeFileSync(outPath, JSON.stringify(src, null, 2), "utf-8");
    console.log(`записано: ${outPath}`);
    return;
  }

  const empty = entries.filter((e) => !unq(e.mstr) && e.line > 10 && e.ctx !== null);

  // тестовая пачка: ИЗ results-файла (честное сравнение моделей) либо окно
  let test: PoEntry[] = [];
  if (testFrom) {
    const base = JSON.parse(readFileSync(testFrom, "utf-8")) as {
      results: Array<{ rows: Array<{ mid: string }> }>;
    };
    const mids = (base.results[0]?.rows ?? []).map((r) => r.mid);
    for (const m of mids) {
      const e = byMid.get(m);
      if (e) test.push(e);
      else console.log(`  WARN: нет записи для mid из базы: ${m.slice(0, 60)}`);
    }
    console.log(`Тестовая пачка ИЗ ${testFrom}: ${test.length} записей`);
  } else {
    const window = empty.filter((e) => e.line >= startLine);
    test = window.slice(0, Math.min(8, nTotal));
    if (test.length < nTotal) {
      const er = /\b(cock|dick|pussy|cunt|fuck|thrust|penetrat|orgasm|wet|naked|breast| tits)\b/i;
      const hot = window.filter((e) => !test.includes(e) && er.test(unq(e.mid))).slice(0, nTotal - test.length);
      test.push(...hot);
    }
    console.log(`Тестовая пачка: ${test.length} записей (окно от строки ${startLine})`);
  }

  // контекст-строки соседей (одна пачка на всех)
  const idxOf = (line: number) => entries.findIndex((e) => e.line === line);
  const ctxOf = (e: PoEntry) => {
    const i = idxOf(e.line);
    const grab = (k: number) => {
      const x = entries[i + k];
      return x ? [`${x.ctx ?? ""} ${unq(x.mid)}`] : [];
    };
    return { prev: [...grab(-2), ...grab(-1)], next: [...grab(1), ...grab(2)] };
  };

  const results: Array<Record<string, unknown>> = [];
  for (const name of want) {
    const base = CONFIGS[name];
    if (!base) {
      console.log(`нет конфига ${name}`);
      continue;
    }
    const c: Cfg = modelOverride
      ? { ...base, model: modelOverride, desc: `${base.desc} [model=${modelOverride}]` }
      : base;
    console.log(`\n=== Конфиг ${name}: ${c.desc} ===`);
    const t0 = Date.now();
    const rows = [];
    for (const e of test) {
      let r: { es: string; tries: number };
      try {
        r = await translateEntry(e, ctxOf(e), c);
      } catch (err) {
        // Сбой одного конфига не должен убивать весь прогон матрицы.
        console.error(`  [${e.line}] СБОЙ конфига ${name}: ${String(err).slice(0, 160)}`);
        break;
      }
      const issues = checkEntry(e, r.es);
      rows.push({ line: e.line, mid: unq(e.mid), es: r.es, tries: r.tries, issues });
      console.log(`  [${e.line}] tries=${r.tries} ${issues.length ? "ISSUES: " + issues.join("; ") : "ok"} :: ${r.es.slice(0, 70)}`);
    }
    const sec = (Date.now() - t0) / 1000;
    let judgeRows: Array<{ line: number; score: number; issues: string[] }> = [];
    if (useJudge) {
      judgeRows = [];
      for (const row of rows) {
        const e = test.find((x) => x.line === row.line)!;
        if (!row.es) continue;
        try {
          const j = await judge(QWEN, e, row.es as string);
          judgeRows.push({ line: row.line, score: j.score, issues: j.issues });
        } catch (err) {
          console.error(`  судья сбой [${row.line}]: ${String(err).slice(0, 120)}`);
        }
      }
    }
    const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : "-");
    const passed = rows.filter((r) => (r.issues as string[]).length === 0).length;
    const summary = {
      config: name,
      desc: c.desc,
      secPerEntry: (sec / test.length).toFixed(1),
      checksPassed: `${passed}/${rows.length}`,
      avgTries: avg(rows.map((r) => r.tries as number)),
      judgeAvg: avg(judgeRows.map((j) => j.score).filter((s) => s >= 0)),
      rows,
      judge: judgeRows,
    };
    results.push(summary);
    console.log(
      `  ИТОГ: ${summary.checksPassed} чеков ok, ${summary.secPerEntry}с/запись, средние попытки ${summary.avgTries}, судья ${summary.judgeAvg}`,
    );
  }

  writeFileSync(outPath, JSON.stringify({ testLines: test.map((e) => e.line), results }, null, 2), "utf-8");
  console.log(`\nРезультаты: ${outPath}`);
  console.log(`\n=== СВОДНАЯ ===`);
  for (const r of results) {
    console.log(
      `${(r.config as string).padEnd(2)} | чеки ${(r.checksPassed as string).padEnd(6)} | ${String(r.secPerEntry).padStart(5)}с/зап | попытки ${String(r.avgTries).padEnd(4)} | судья ${String(r.judgeAvg).padEnd(5)} | ${(r.desc as string)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
