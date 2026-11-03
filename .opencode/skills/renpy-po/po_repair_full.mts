/**
 * po_repair_full.mts — судья + АВТО-ПРАВКА переведённых строк .po (доводка до идеала).
 *
 * Отличие от po_judge_full (только отчёт): найденные дефекты ИСПРАВЛЯЮТСЯ в файле,
 * поэтому .po улучшается на ходу и его можно открывать и проверять.
 *
 * Поток на строку:
 *   НОВАЯ:      judgeVerified → ≥порога? → JSONL {ok} : АВТО-ПРАВКА
 *   ПРАВКА:     промпт правки (правила systemPrompt + замечания судьи)
 *               → кандидат → checkTranslation (детерминированные шлюзы)
 *               → judgeVerified(кандидат) → ≥порога?
 *                 ДА  → writePoAtomic(.po) → JSONL {repaired}   (файл меняется!)
 *                 НЕТ → JSONL {repair_failed} → human-лист (append), файл НЕ трогаем
 *
 * Исключений по длине строки НЕТ (2026-11-02): раньше короткие (≤15 символов)
 * при провале автоматически уходили в human-лист «без правки» — считалось, что
 * судья на обрывках врёт. Порог выпилен по решению владельца: это магическое
 * число (длина не критерий), а защита дублировала главный шлюз — в файл и так
 * пишется ТОЛЬКО кандидат ≥ порога. Побочный ущерб старого правила был реальным:
 * короткие строки с настоящей ошибкой («A cunt.» → «Как последняя сука.») никто
 * не чинил, они просто копились в списке на ручной разбор.
 *
 * Правило владельца: порог НЕ двигается — в файл пишется только кандидат ≥ порога.
 * Резюме: JSONL append-only, статус строки = ПОСЛЕДНЯЯ запись по msgid.
 * Крэш-безопасность правки: СНАЧАЛА writePoAtomic, ПОТОМ JSONL (крэш между ними
 * дал бы «JSONL говорит repaired, а в файле старое» — строка пропала бы навсегда).
 *
 * Использование:
 *   node .opencode/skills/renpy-po/po_repair_full.mts --lang ru --limit 5   # проба
 *   node .opencode/skills/renpy-po/po_repair_full.mts --lang ru --concurrency 8
 *
 * Флаги: --concurrency N (8 = слоты Strata), --limit N, --threshold N (9),
 *        --base-url/--model (оверрайд бэкенда).
 * Окружение: TSSR_PO_DIR — каталог po (для e2e с фикстурой; дефолт — боевой).
 * Файлы: tmp/po_repair_full_<lang>.jsonl (статусы), tmp/po_repair_full_<lang>.failed.txt
 *        (правки не прошедшие судью — на ручной разбор, дописывается на лету).
 *
 * Тесты: po_repair_full.test.mts (юнит: loadStatesFrom/classify) и
 *        po_repair_full_e2e.test.mts (живой прогон на фикстуре, TSSR_PO_E2E=1).
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parsePo, renderPo, writePoAtomic, type PoEntry } from "./po_core.mts";
import {
  checkTranslation,
  chat,
  extractJson,
  extractTranslation,
  genderLine,
  judgeVerified,
  systemPrompt,
} from "./po_translate.mts";
import { poHeaderLines } from "./po_update.mts";
import { potIndex } from "./pot_resolve.mts";
import { resolveBackend } from "../../../scripts/llm_backend.mts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Статус строки: последняя запись JSONL по msgid побеждает. */
export interface State {
  ok?: boolean;
  human?: boolean;
  repaired?: boolean;
  repair_failed?: boolean;
  score?: number;
  issues?: string[];
  err?: string;
}

export interface Task {
  kind: "repair" | "judge";
  entry: PoEntry;
  prior?: { score: number; issues: string[] };
}

/** Загрузка статусов из JSONL: последняя запись по msgid побеждает, битые строки пропускаются. */
export function loadStatesFrom(path: string): Map<string, State> {
  const m = new Map<string, State>();
  if (!existsSync(path)) return m;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line) as State & { msgid?: string };
      if (j.msgid) m.set(j.msgid, j);
    } catch {
      // битая хвостовая строка после обрыва — пересчитается при следующем проходе
    }
  }
  return m;
}

/**
 * Классификация строк в задачи. Чистая функция (без побочных эффектов):
 *   ok/repaired/repair_failed/human → пропуск;
 *   ok=false (голый) → task repair (с прежним скором/замечаниями);
 *   нет статуса → task judge. Правки идут первыми (порядок: repair → judge).
 */
export function classify(voice: PoEntry[], states: Map<string, State>): Task[] {
  const tasks: Task[] = [];
  const seen = new Set<string>();
  for (const e of voice) {
    if (seen.has(e.msgid)) continue;
    seen.add(e.msgid);
    const st = states.get(e.msgid);
    if (st?.ok || st?.repaired || st?.human || st?.repair_failed) continue;
    if (st && st.ok === false) {
      tasks.push({ kind: "repair", entry: e, prior: { score: st.score ?? -1, issues: st.issues ?? [] } });
    } else {
      tasks.push({ kind: "judge", entry: e });
    }
  }
  // Правки первыми — файл улучшается сразу, затем новые строки.
  tasks.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "repair" ? -1 : 1));
  return tasks;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string, def = ""): string => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : def;
  };

  const LANG = flag("lang");
  const THRESHOLD = Number(flag("threshold", "9"));
  const CONCURRENCY = Math.max(1, Number(flag("concurrency", "8")));
  const backend = resolveBackend();
  const BASE = flag("base-url", backend.url);
  const MODEL = flag("model", backend.model);
  const PO_DIR = process.env.TSSR_PO_DIR ?? join(REPO, "patches", "ai-voice-pack", "po");

  if (!/\S/.test(LANG) || LANG.includes("/") || LANG.includes("..")) {
    console.error("нужен --lang <код> (без / и ..)");
    process.exit(2);
  }

  const poPath = join(PO_DIR, `${LANG}.po`);
  const jsonlPath = join(REPO, "tmp", `po_repair_full_${LANG}.jsonl`);
  const failedPath = join(REPO, "tmp", `po_repair_full_${LANG}.failed.txt`);

  const poText = readFileSync(poPath, "utf-8").replace(/\r\n/g, "\n");
  const headerLines = poHeaderLines(poText);
  const entries = parsePo(poText);
  const voice = entries.filter((e) => e.msgid && e.msgstr.trim());

  function emotionOf(e: PoEntry): string | null {
    // Тон/пол живут в POT (DRY); в po комментов НЕТ — старая реализация по
    // комментариям po всегда возвращала null (правка шла без тона и без пола).
    return potIndex().emotion(e.msgctxt, e.msgid);
  }

  // СОСЕДИ ПО СЦЕНЕ (2026-11-02). Порядок po = порядок исходников игры, поэтому
  // соседние по индексу строки — реальный диалог, а не случайные однофамильцы
  // из алфавитной сортировки. Границу сцены держим явно: дедуп кладёт строку в
  // ПЕРВУЮ сцену, где она встретилась, поэтому сосед по индексу может оказаться
  // из другой сцены — такой сосед не контекст, а шум.
  //
  // Индекс строится по ПОЛНОМУ списку `entries` (не по `voice`): соседняя
  // реплика — контекст и тогда, когда её перевод ещё пустой.
  const idxOf = new Map<string, number>();
  entries.forEach((e, i) => {
    const k = `${e.msgctxt}\u0000${e.msgid}`;
    if (!idxOf.has(k)) idxOf.set(k, i);
  });
  const sceneCache = new Map<string, string | null>();
  function sceneOf(e: PoEntry): string | null {
    const k = `${e.msgctxt}\u0000${e.msgid}`;
    if (!sceneCache.has(k)) sceneCache.set(k, potIndex().resolve(e.msgctxt, e.msgid)?.scene ?? null);
    return sceneCache.get(k) ?? null;
  }

  /** До трёх предыдущих и одной следующей реплики ТОЙ ЖЕ сцены (EN-текст). */
  function neighborsOf(e: PoEntry): { prev: string[]; next: string[] } {
    const i = idxOf.get(`${e.msgctxt}\u0000${e.msgid}`);
    const scene = sceneOf(e);
    if (i === undefined || !scene) return { prev: [], next: [] };
    const pick = (step: -1 | 1): string[] => {
      // Асимметрия 3+1 (2026-11-03, решение владельца): предыдущие реплики
      // несут антецеденты, следующая — только реакция.
      const limit = step === -1 ? 3 : 1;
      const out: string[] = [];
      for (let k = i + step; k >= 0 && k < entries.length && out.length < limit; k += step) {
        const x = entries[k];
        if (sceneOf(x) !== scene) break;
        out.push(`${x.msgctxt} ${x.msgid}`);
      }
      return step === -1 ? out.reverse() : out;
    };
    return { prev: pick(-1), next: pick(1) };
  }

  const states = loadStatesFrom(jsonlPath);
  const tasks = classify(voice, states);

  function appendRow(row: Record<string, unknown>): void {
    appendFileSync(jsonlPath, `${JSON.stringify(row)}\n`, "utf-8");
  }

  const LIMIT_N = Number(flag("limit", "0"));
  if (LIMIT_N > 0) tasks.length = Math.min(tasks.length, LIMIT_N);

  const repairCount = tasks.filter((t) => t.kind === "repair").length;
  console.log(
    `[po:repair-full] ${LANG}: переведено ${voice.length} | статусов из JSONL ${states.size}` +
      ` | к работе ${tasks.length} (правок ${repairCount})` +
      ` | порог ${THRESHOLD} | ${MODEL} (c=${CONCURRENCY})`,
  );
  if (!tasks.length) {
    console.log("нечего делать — всё уже оценено/исправлено");
    process.exit(0);
  }

  const stats = { judgeOk: 0, repaired: 0, failed: 0, done: 0 };
  let statesBase = states.size;

  function progressLine(): string {
    return (
      `[${statesBase + stats.done}] ok+=${stats.judgeOk} repaired+=${stats.repaired} ` +
      `failed+=${stats.failed} (файл ${LANG}.po улучшен ${stats.repaired} раз)`
    );
  }

  /**
   * Промпт правки: правила перевода + замечания судьи + тон/пол из POT +
   * соседние реплики ТОЙ ЖЕ сцены (порядок po = порядок игры).
   */
  function repairUser(e: PoEntry, emotion: string | null, priorScore: number, issues: string[]): string {
    const issueList = issues.length ? issues.map((i) => `- ${i}`).join("\n") : "- (замечаний нет — оценка ниже порога)";
    const tone = emotion ? `\nTone of this line: ${emotion}` : "";
    const gender = genderLine(e.msgctxt, e.msgid);
    const { prev, next } = neighborsOf(e);
    const scene = sceneOf(e);
    const ctx: string[] = [];
    if (prev.length || next.length) {
      ctx.push(
        ``,
        `Scene${scene ? ` "${scene}"` : ""} — neighbouring lines, for CONTEXT ONLY. ` +
          `Read them to get the situation and what this line answers; translate ONLY the line marked [THIS LINE], never a neighbour:`,
        ...prev,
        `[THIS LINE] ${e.msgctxt} ${e.msgid}`,
        ...next,
      );
    }
    return [
      `A translation of this game line was REJECTED by a quality reviewer (score ${priorScore}/10).`,
      `Fix it: address every issue below, keep everything that is already correct`,
      `(names, quotes, placeholders, register, tone, grammatical GENDER agreement).${tone}${gender ? `\n${gender}` : ""}`,
      ...ctx,
      ``,
      `EN source:`,
      e.msgid,
      ``,
      `Current translation (rejected):`,
      e.msgstr,
      ``,
      `Reviewer issues:`,
      issueList,
      ``,
      `Output ONLY JSON: {"tr": "<corrected translation>"}`,
    ].join("\n");
  }

  async function doRepair(e: PoEntry, priorScore: number, issues: string[]): Promise<void> {
    const emotion = emotionOf(e);
    let cand = "";
    let gateErr = "";
    let verdict = -1;
    let verdictIssues: string[] = [];
    try {
      const raw = await chat(
        BASE,
        [
          { role: "system", content: systemPrompt(LANG) },
          { role: "user", content: repairUser(e, emotion, priorScore, issues) },
        ],
        { model: MODEL, temp: 0.3, maxTokens: 900 },
      );
      cand = extractTranslation(extractJson(raw), LANG);
      if (!cand) gateErr = "кандидат не извлечён из ответа";
      else {
        const gates = checkTranslation(e, cand, LANG);
        if (gates.length) gateErr = `шлюз: ${gates.join("; ")}`;
        else {
          const v = await judgeVerified(BASE, MODEL, LANG, e, cand, emotion, THRESHOLD, neighborsOf(e).prev);
          verdict = v.score;
          verdictIssues = v.issues;
          if (v.score < THRESHOLD) gateErr = `судья ${v.score}/10: ${v.issues.join("; ") || "-"}`;
        }
      }
    } catch (err) {
      gateErr = `ошибка: ${String((err as Error).message).slice(0, 140)}`;
    }

    if (!gateErr && cand) {
      const old = e.msgstr;
      e.msgstr = cand; // мутация в памяти
      writePoAtomic(poPath, renderPo(entries, headerLines)); // СНАЧАЛА файл...
      appendRow({
        msgid: e.msgid,
        ok: true,
        repaired: true,
        score: verdict,
        old,
        new: cand,
        issues: verdictIssues,
      }); // ...ПОТОМ статус
      stats.repaired++;
    } else {
      appendRow({ msgid: e.msgid, ok: false, repair_failed: true, score: verdict, err: gateErr.slice(0, 300) });
      appendFileSync(
        failedPath,
        `${e.msgid}\n   БЫЛО: ${e.msgstr}\n   ПРАВКА НЕ ПРОШЛА: ${gateErr.slice(0, 300)}\n\n`,
        "utf-8",
      );
      stats.failed++;
    }
  }

  async function doJudge(e: PoEntry): Promise<void> {
    const emotion = emotionOf(e);
    const r = await judgeVerified(BASE, MODEL, LANG, e, e.msgstr, emotion, THRESHOLD, neighborsOf(e).prev);
    if (r.score >= THRESHOLD) {
      appendRow({ msgid: e.msgid, ok: true, score: r.score, issues: r.issues });
      stats.judgeOk++;
    } else {
      await doRepair(e, r.score, r.issues);
    }
  }

  async function worker(): Promise<void> {
    for (;;) {
      const t = tasks.shift();
      if (!t) return;
      try {
        if (t.kind === "repair") await doRepair(t.entry, t.prior?.score ?? -1, t.prior?.issues ?? []);
        else await doJudge(t.entry);
      } catch (err) {
        // строку не теряем: статус остался прежним — перезапуск доработает
        appendRow({ msgid: t.entry.msgid, ok: false, error: String((err as Error).message).slice(0, 200) });
        stats.failed++;
      }
      stats.done++;
      if (stats.done % 25 === 0) console.log(`  ${progressLine()}`);
    }
  }

  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const sec = (Date.now() - t0) / 1000;
  console.log(
    `\n[po:repair-full] выполнено ${stats.done} за ${sec.toFixed(0)}с | ` +
      `новых ok ${stats.judgeOk} | ИСПРАВЛЕНО В ФАЙЛ ${stats.repaired} | не прошло ${stats.failed}`,
  );
  console.log(`файл: ${poPath} | не прошли: ${failedPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
