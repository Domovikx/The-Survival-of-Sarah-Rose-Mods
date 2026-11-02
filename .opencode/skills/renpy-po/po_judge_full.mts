/**
 * po_judge_full.mts — ПОЛНЫЙ прогон LLM-судьи по уже переведённым строкам .po
 * с резюмом (в отличие от po_judge_check — посимвольный список, без возобновления).
 *
 * Зачем: перепроверка качества УЖЕ переведённого (ru.po — 69k строк; прогон
 * десятки часов, обрывы неизбежны). Результат дописывается JSONL-строками
 * в tmp/po_judge_full_<lang>.jsonl; при перезапуске уже оценённые msgid
 * ПРОПУСКАЮТСЯ — обрыв/стоп ничего не теряет.
 *
 * Использование:
 *   node .opencode/skills/renpy-po/po_judge_full.mts --lang ru
 *   node .opencode/skills/renpy-po/po_judge_full.mts --lang ru --concurrency 2 --limit 500
 *   node .opencode/skills/renpy-po/po_judge_full.mts --lang ru --fast --limit 150  # A/B
 *
 * Флаги: --concurrency N (по умолчанию 1; сумма с po-очередью ≤ kv-slots Colibri=8),
 *        --limit N (строк в этом запуске), --threshold N (по умолчанию 9),
 *        --fast (ОДИН вызов судьи вместо цепочки — режим A/B),
 *        --base-url/--model (оверрайд бэкенда).
 * Окружение: TSSR_JUDGE_JSONL — путь к файлу статусов (для A/B-прогонов).
 *
 * Выход: прогресс в stdout; сводка в конце. Exit 0 — все ≥ порога,
 * 1 — есть ниже порога (список в tmp/po_judge_full_<lang>.bad.txt).
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parsePo, type PoEntry } from "./po_core.mts";
import { judge, judgeVerified } from "./po_translate.mts";
import { resolveBackend } from "../../../scripts/llm_backend.mts";

const REPO = process.cwd();
const PO = join(REPO, "patches", "ai-voice-pack", "po");

const args = process.argv.slice(2);
const flag = (name: string, def = ""): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const LANG = flag("lang");
const THRESHOLD = Number(flag("threshold", "9"));
const CONCURRENCY = Math.max(1, Number(flag("concurrency", "1")));
const LIMIT = Number(flag("limit", "0"));
const backend = resolveBackend();
const BASE = flag("base-url", backend.url);
const MODEL = flag("model", backend.model);
/** --fast: ОДИН вызов судьи вместо цепочки judgeVerified (A/B для ускорения). */
const FAST = args.includes("--fast");

if (!/\S/.test(LANG) || LANG.includes("/") || LANG.includes("..")) {
  console.error("нужен --lang <код> (без / и ..)");
  process.exit(2);
}

const poPath = join(PO, `${LANG}.po`);
// TSSR_JUDGE_JSONL — переопределение для A/B-прогонов (свежие файлы статусов)
const jsonlPath = process.env.TSSR_JUDGE_JSONL || join(REPO, "tmp", `po_judge_full_${LANG}.jsonl`);
const badPath = join(REPO, "tmp", `po_judge_full_${LANG}.bad.txt`);

const entries = parsePo(readFileSync(poPath, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid && e.msgstr.trim());

/** Тон — так же, как в po_translate/po_judge_check: из комментариев POT. */
function emotionOf(e: PoEntry): string | null {
  const line = e.comments.find((c) => c.startsWith("emotion:"));
  return line ? line.slice("emotion:".length).trim() || null : null;
}

/** Уже оценённые msgid (резюме из JSONL). */
function loadDone(): Set<string> {
  const done = new Set<string>();
  if (!existsSync(jsonlPath)) return done;
  for (const line of readFileSync(jsonlPath, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line) as { msgid?: string };
      if (j.msgid) done.add(j.msgid);
    } catch {
      // битая хвостовая строка после обрыва — пропускаем, она пересчитается
    }
  }
  return done;
}

const done = loadDone();
let targets = entries.filter((e) => !done.has(e.msgid));
if (LIMIT > 0) targets = targets.slice(0, LIMIT);

console.log(
  `[po:judge-full] ${LANG}: переведено всего ${entries.length} | уже оценено ${done.size} | к прогону ${targets.length} | порог ${THRESHOLD} | ${MODEL} (параллелизм ${CONCURRENCY})`,
);
if (!targets.length) {
  console.log("нечего оценивать — всё уже в JSONL");
  process.exit(0);
}

interface Row {
  msgid: string;
  msgstr: string;
  score: number;
  issues: string[];
  ok: boolean;
  shaky: boolean;
}

const bad: Row[] = [];
let judged = 0;
let okCount = 0;

/** Пул воркеров: каждый берёт следующую строку (параллелизм ≤ kv-slots LLM). */
async function worker(): Promise<void> {
  for (;;) {
    const e = targets.shift();
    if (!e) return;
    const r = FAST
      ? await judge(BASE, MODEL, LANG, e, e.msgstr, emotionOf(e))
      : await judgeVerified(BASE, MODEL, LANG, e, e.msgstr, emotionOf(e), THRESHOLD);
    const row: Row = {
      msgid: e.msgid,
      msgstr: e.msgstr,
      score: r.score,
      issues: r.issues,
      ok: r.score >= THRESHOLD,
      shaky: e.msgid.trim().length <= 15,
    };
    // Допись ПОСЛЕ каждой строки — обрыв теряет максимум одну запись.
    appendFileSync(jsonlPath, `${JSON.stringify(row)}\n`, "utf-8");
    judged++;
    if (row.ok) okCount++;
    else bad.push(row);
    if (judged % 25 === 0 || judged === targets.length) {
      const pct = (((done.size + judged) / (done.size + targets.length + judged)) * 100).toFixed(1);
      console.log(`  [${done.size + judged}] ok=${okCount} ниже=${bad.length} (${pct}%) судья=${row.score}`);
    }
  }
}

const t0 = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
const sec = (Date.now() - t0) / 1000;

console.log(
  `\n[po:judge-full] оценено ${judged} за ${sec.toFixed(0)}с (${(judged / sec).toFixed(2)} строк/с) | принято ${okCount} | ниже порога ${bad.length}`,
);
if (bad.length) {
  writeFileSync(
    badPath,
    bad
      .map((r) => `${r.score}/10 ${r.msgid}\n   -> ${r.msgstr}\n   issues: ${r.issues.join("; ") || "-"}`)
      .join("\n\n"),
    "utf-8",
  );
  console.log(`список ниже порога: ${badPath}`);
  process.exit(1);
}
