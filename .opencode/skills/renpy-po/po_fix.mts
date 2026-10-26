/**
 * po_fix.mts — точечные правки po-записей по индексам (пакетно из JSON).
 *
 * Нужен, когда QA-ревью (скилл po-audit / агенты) нашло ошибки в УЖЕ
 * переведённом: применяется карта «idx → правка» к po/<lang>.po.
 * Индекс = позиция записи в файле (та же нумерация, что у po_list.mts
 * и po_audit.mts), поэтому отчёт ревьюера конвертируется без ручной работы.
 *
 * Операции:
 *   clear  — msgstr = "" (возврат в очередь po:translate на перепрогон)
 *   set    — msgstr = <text> (ручная правка, когда перевод знаете точно)
 *
 * Запуск:
 *   node po_fix.mts --lang it --clear 1535,2393
 *   node po_fix.mts --lang it --set '13180=Di nuovo a casa.'
 *   node po_fix.mts --apply tmp/po_fixes.json   # пакет: [{lang,idx,op,text}]
 *   node po_fix.mts --apply tmp/po_fixes.json --dry   # что изменится, без записи
 *
 * Безопасность: как и po_translate, НЕ запускается для языка с активным
 * прогоном (иначе работающий процесс перетрёт правку своим flush'ем).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parsePo, renderPo } from "./po_core.mts";
import { poHeaderLines } from "./po_update.mts";
import { ALL_LANGS, isRunning } from "./po_translate.mts";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SKILL_DIR, "..", "..", "..");
const PO_DIR = join(REPO_ROOT, "patches", "ai-voice-pack", "po");

export interface FixOp {
  lang: string;
  idx: number;
  op: "clear" | "set";
  /** Текст для op=set. */
  text?: string;
}

/**
 * Применяет правки к ОДНОМУ языку: возвращает число изменённых записей
 * (и пишет файл, если changed > 0 и !dry). Незнакомые idx — пропуск с
 * предупреждением (индексы могут сдвинуться, если файл перегенерирован).
 */
export function applyFixes(
  lang: string,
  ops: FixOp[],
  dry = false,
  poDir: string = PO_DIR,
): { changed: number; skipped: number[] } {
  const poPath = join(poDir, `${lang}.po`);
  const text = readFileSync(poPath, "utf-8").replace(/\r\n/g, "\n");
  const header = poHeaderLines(text);
  // Нумерация idx = по записям с непустым msgid — ТА ЖЕ, что у po_list.mts
  // (агенты/ревью отчитываются её индексами; заголовок po-файла в неё не входит).
  const entries = parsePo(text).filter((e) => e.msgid);
  const byIdx = new Map<number, FixOp>();
  for (const o of ops) byIdx.set(o.idx, o);
  let changed = 0;
  const skipped: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    const op = byIdx.get(i);
    if (!op) continue;
    const e = entries[i];
    if (op.op === "clear") {
      if (!e.msgstr) {
        skipped.push(i);
        continue;
      }
      e.msgstr = "";
      changed++;
    } else {
      const t = op.text ?? "";
      if (e.msgstr === t) {
        skipped.push(i);
        continue;
      }
      e.msgstr = t;
      changed++;
    }
  }
  for (const i of byIdx.keys()) if (i >= entries.length) skipped.push(i);
  if (changed && !dry) writeFileSync(poPath, renderPo(entries, header), "utf-8");
  return { changed, skipped: [...skipped].sort((a, b) => a - b) };
}

/** Разбор CLI. Возвращает операции + режим. */
export function parseCli(argv: string[]): { ops: FixOp[]; dry: boolean; help: boolean } {
  const ops: FixOp[] = [];
  let dry = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry") dry = true;
    else if (a === "--help" || a === "-h") help = true;
    else if (a === "--lang") {
      const lang = argv[++i] || "";
      const next = argv[i + 1];
      if (next === "--clear") {
        i += 1; // i теперь на "--clear", значение возьмём через ++i
        for (const idx of (argv[++i] || "")
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => n >= 0)) {
          ops.push({ lang, idx, op: "clear" });
        }
      } else if (next === "--set") {
        i += 1;
        const raw = argv[++i] || "";
        const eq = raw.indexOf("=");
        if (eq < 0) throw new Error(`--set ждёт "idx=текст", получено: ${raw}`);
        ops.push({ lang, idx: Number(raw.slice(0, eq)), op: "set", text: raw.slice(eq + 1) });
      } else throw new Error("после --lang ждётся --clear <idx,..> или --set <idx=текст>");
    } else if (a === "--apply") {
      const file = argv[++i] || "";
      const arr = JSON.parse(readFileSync(file, "utf-8")) as FixOp[];
      if (!Array.isArray(arr)) throw new Error(`${file}: ждал массив операций`);
      for (const o of arr) {
        if (!o || typeof o.lang !== "string" || typeof o.idx !== "number" || (o.op !== "clear" && o.op !== "set")) {
          throw new Error(`${file}: невалидная операция ${JSON.stringify(o)}`);
        }
        ops.push(o);
      }
    } else throw new Error(`неизвестный аргумент: ${a}`);
  }
  return { ops, dry, help };
}

function main(): void {
  let parsed: ReturnType<typeof parseCli>;
  try {
    parsed = parseCli(process.argv.slice(2));
  } catch (e) {
    console.error(`Ошибка: ${(e as Error).message}`);
    process.exit(1);
    return;
  }
  if (parsed.help || !parsed.ops.length) {
    console.log(
      "Usage: node po_fix.mts --lang <code> --clear <idx,idx> | --set '<idx=текст>'\n" +
        "       node po_fix.mts --apply <fixes.json> [--dry]\n" +
        `Языки: ${ALL_LANGS.join(", ")}`,
    );
    process.exit(parsed.help ? 0 : 1);
  }
  // группировка по языкам + защита от одновременного прогона
  const byLang = new Map<string, FixOp[]>();
  for (const o of parsed.ops) {
    if (!ALL_LANGS.includes(o.lang)) {
      console.error(`Неизвестный язык: ${o.lang}`);
      process.exit(1);
    }
    byLang.set(o.lang, [...(byLang.get(o.lang) ?? []), o]);
  }
  let total = 0;
  for (const [lang, ops] of byLang) {
    if (isRunning(lang)) {
      console.error(`${lang}: прогон ИДЁТ — правки отменены (иначе flush перетрёт). Жди завершения.`);
      process.exit(2);
    }
    const r = applyFixes(lang, ops, parsed.dry);
    total += r.changed;
    const mode = parsed.dry ? "[dry] изменено БЫЛО бы" : "изменено";
    console.log(
      `${lang}: ${mode} ${r.changed} из ${ops.length}${r.skipped.length ? `, пропущено: ${r.skipped.join(",")}` : ""}`,
    );
  }
  if (!parsed.dry) console.log(`итого изменено записей: ${total}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
