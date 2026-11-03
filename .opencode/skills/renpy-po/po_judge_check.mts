/**
 * po_judge_check.mts — прогон КОНКРЕТНЫХ строк через LLM-судью.
 *
 * Зачем: ручные/агентские правки в .po НЕ проходят через po:translate, а
 * значит их никто не проверяет — перевод может оказаться хуже исходного.
 * Этот инструмент закрывает дыру качества: берёт список msgid, спрашивает
 * судью и рапортует баллы. Порог НЕ двигается (правило владельца: качество
 * не снижаем, сверка смысла — работа судьи).
 *
 * Использование:
 *   node po_judge_check.mts --lang es --file tmp/to_check.txt  # msgid по строке
 *   node po_judge_check.mts --lang es --stdin                  # msgid из stdin
 *   node po_judge_check.mts --lang es --empty --limit 50       # все пустые (диагностика)
 *
 * Флаги: --threshold N (по умолчанию 9), --json (машинный вывод),
 *        --base-url / --model (переопределение LLM).
 * Выход: 0 — все ≥ порога; 1 — есть строки ниже порога; 2 — аргументы/файлы.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePo, type PoEntry } from "./po_core.mts";
import { judgeVerified } from "./po_translate.mts";
import { resolveBackend } from "../../../scripts/llm_backend.mts";

const REPO = process.cwd();
const PO = join(REPO, "patches", "ai-voice-pack", "po");

const args = process.argv.slice(2);
const flag = (name: string, def = ""): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const has = (name: string): boolean => args.includes(`--${name}`);

const LANG = flag("lang");
const THRESHOLD = Number(flag("threshold", "9"));
const JSON_OUT = has("json");
const BASE = flag("base-url", resolveBackend().url);
const MODEL = flag("model", resolveBackend().model);

if (!LANG) {
  console.error("нужен --lang <код>");
  process.exit(2);
}

const poPath = join(PO, `${LANG}.po`);
if (!/\S/.test(LANG) || LANG.includes("/") || LANG.includes("..")) {
  console.error(`подозрительный код языка: ${LANG}`);
  process.exit(2);
}
const entries = parsePo(readFileSync(poPath, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);

/** 2 предыдущие реплики по порядку po (= порядок игры, 2026-11-03) — контекст судьи. */
const prevOf = new Map<string, string[]>();
entries.forEach((e, i) => {
  prevOf.set(
    `${e.msgctxt}\u0000${e.msgid}`,
    [entries[i - 2], entries[i - 1]].filter((x): x is PoEntry => Boolean(x)).map((x) => `${x.msgctxt} ${x.msgid}`),
  );
});
const prevFor = (e: PoEntry): string[] => prevOf.get(`${e.msgctxt}\u0000${e.msgid}`) ?? [];

/** Цепочка проверки: файл (по строке), stdin или все пустые. */
function pickTargets(): PoEntry[] {
  if (has("empty")) {
    const limit = Number(flag("limit", "0"));
    const empty = entries.filter((e) => !e.msgstr.trim());
    return limit > 0 ? empty.slice(0, limit) : empty;
  }
  let ids: string[];
  if (has("stdin")) {
    ids = readFileSync(0, "utf-8").split("\n");
  } else {
    const f = flag("file");
    if (!f) {
      console.error("нужен --file <txt>, --stdin или --empty");
      process.exit(2);
    }
    ids = readFileSync(f, "utf-8").split("\n");
  }
  const wanted = ids.map((l) => l.trim()).filter(Boolean);
  if (!wanted.length) {
    console.error("пустой список строк для проверки");
    process.exit(2);
  }
  const byId = new Map(entries.map((e) => [e.msgid, e]));
  const missing = wanted.filter((id) => !byId.has(id));
  if (missing.length) {
    console.error(`в ${LANG}.po не найдено ${missing.length} шт, напр.: ${missing.slice(0, 2).join(" | ")}`);
    process.exit(2);
  }
  return wanted.map((id) => byId.get(id)!);
}

/** Тон берём так же, как po_translate — из комментариев POT. */
function emotionOf(e: PoEntry): string | null {
  const line = e.comments.find((c) => c.startsWith("emotion:"));
  return line ? line.slice("emotion:".length).trim() || null : null;
}

const targets = pickTargets();
console.log(`[po:judge-check] ${LANG}: строк ${targets.length} | порог ${THRESHOLD} | ${MODEL}`);

interface Row {
  msgid: string;
  score: number;
  issues: string[];
  ok: boolean;
}
const rows: Row[] = [];

for (const e of targets) {
  // последовательно намеренно: LM Studio обслуживает очередь по одной,
  // параллельный запрос лишь замедлил бы обе стороны
  // eslint-disable-next-line no-await-in-loop
  const r = await judgeVerified(BASE, MODEL, LANG, e, e.msgstr, emotionOf(e), THRESHOLD, prevFor(e));
  const row: Row = { msgid: e.msgid, score: r.score, issues: r.issues, ok: r.score >= THRESHOLD };
  rows.push(row);
  if (JSON_OUT) {
    console.log(JSON.stringify({ lang: LANG, ...row }));
  } else {
    const tag = row.ok ? "OK " : "НИЖЕ";
    console.log(`  ${tag} ${String(row.score).padStart(2)}/10 | ${row.msgid.slice(0, 78)}`);
    if (!row.ok) for (const i of row.issues.slice(0, 3)) console.log(`         - ${i}`);
  }
}

const bad = rows.filter((r) => !r.ok);
const worst = rows.length ? Math.min(...rows.map((r) => r.score)) : "-";
console.log(`\n[po:judge-check] принято ${rows.length - bad.length}/${rows.length} | худший балл ${worst}`);

if (bad.length) {
  console.log(`[po:judge-check] ниже порога: ${bad.length}`);
  for (const b of bad) console.log(`  ${b.score}/10  ${b.msgid.slice(0, 90)}`);
  process.exit(1);
}
process.exit(0);
