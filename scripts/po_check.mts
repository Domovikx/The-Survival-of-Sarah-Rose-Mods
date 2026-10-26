/**
 * po_check.mts — локальная проверка PO-файлов перед коммитом.
 *
 * Ловит именно ту аварию, которая реально случилась (2026-10-26): перезапуск
 * сервера убил переводчик посреди записи -> de.po стал 7.5 МБ нулей (0 msgid).
 * Ловит также обрыв/усечение файла и остатки временных `.part`.
 *
 * Использование:
 *   node scripts/po_check.mts              # проверить изменённые рабочие файлы
 *   node scripts/po_check.mts --staged     # проверить то, что в staged (для pre-commit)
 *   node scripts/po_check.mts --all        # проверить все 10 po целиком
 *
 * Выход 0 = всё цело, 1 = найдена порча (коммит должен быть прерван).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

const REPO = process.cwd();
const PO_DIR = join(REPO, "patches", "ai-voice-pack", "po");
const LANGS = ["de", "es", "fr", "it", "ja", "ko", "pl", "pt", "ru", "zh"];
/** Допустимая убыть записей относительно HEAD (msgmerge может убирать мёртвые). */
const LOSS_TOLERANCE = 0.9;

const argv = new Set(process.argv.slice(2));
const staged = argv.has("--staged");
const all = argv.has("--all");

function entriesOf(text: string): number {
  const clean = text.replace(/\r\n/g, "\n");
  const parsed = parsePo(clean);
  if (!parsed.length) throw new Error("parsePo не вернул ни одной записи");
  const n = parsed.filter((e) => e.msgid).length;
  if (n < 1000) throw new Error(`подозрительно мало записей: ${n}`);
  return n;
}

function gitShow(spec: string): string | null {
  try {
    return execFileSync("git", ["show", spec], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

function changedPoFiles(): string[] {
  try {
    const out = execFileSync("git", ["diff", "--name-only", "HEAD", "--", "patches/ai-voice-pack/po"], {
      encoding: "utf-8",
    });
    return out
      .split("\n")
      .filter((l) => l.endsWith(".po"))
      .map((l) => l.split("/").pop() as string);
  } catch {
    return [];
  }
}

function stagedPoFiles(): string[] {
  try {
    const out = execFileSync("git", ["diff", "--cached", "--name-only", "--", "patches/ai-voice-pack/po"], {
      encoding: "utf-8",
    });
    return out
      .split("\n")
      .filter((l) => l.endsWith(".po"))
      .map((l) => l.split("/").pop() as string);
  } catch {
    return [];
  }
}

const problems: string[] = [];
const report: string[] = [];

// 1. остатки атомарной записи = обрыв процесса прямо сейчас
const leftovers = readdirSync(PO_DIR).filter((f) => f.endsWith(".po.part"));
if (leftovers.length) problems.push(`обнаружены недописанные ${leftovers.join(", ")}`);

const targets = all ? LANGS.map((l) => `${l}.po`) : staged ? stagedPoFiles() : changedPoFiles();

if (!targets.length) {
  console.log(all ? "[po:check] нет po-файлов?" : "[po:check] po-файлов к проверке нет — ок");
  process.exit(0);
}

for (const file of targets) {
  const path = join(PO_DIR, file);
  const lang = file.replace(/\.po$/, "");

  // 2. читаем версию, которая реально уйдёт в коммит
  let text: string | null;
  if (staged) {
    text = gitShow(`:patches/ai-voice-pack/po/${file}`);
    if (text === null) {
      problems.push(`${file}: staged-копия не читается`);
      continue;
    }
  } else if (existsSync(path)) {
    text = readFileSync(path, "utf-8");
  } else {
    problems.push(`${file}: файла нет`);
    continue;
  }

  // 3. парсинг (выбросит исключение на обнулённом/оборванном файле)
  let count: number;
  try {
    count = entriesOf(text);
  } catch (e) {
    problems.push(`${file}: НЕ ПАРИСИТСЯ — ${String(e).slice(0, 100)}`);
    continue;
  }

  // 4. сравнение с HEAD: усечение — главный признак порчи
  const head = gitShow(`HEAD:patches/ai-voice-pack/po/${file}`);
  if (head !== null) {
    let headCount = 0;
    try {
      headCount = entriesOf(head);
    } catch {
      headCount = 0;
    }
    if (headCount > 0 && count < headCount * LOSS_TOLERANCE) {
      problems.push(
        `${file}: УСЕЧЕНО ${count} записей против ${headCount} в HEAD (${((count / headCount) * 100).toFixed(1)}%)`,
      );
      continue;
    }
  }

  const empty =
    staged || !existsSync(path)
      ? -1
      : parsePo(text.replace(/\r\n/g, "\n")).filter((e) => e.msgid && !e.msgstr.trim()).length;
  report.push(`  ${lang}: ${count} записей${empty >= 0 ? `, пустых ${empty}` : ""}`);
}

console.log(`[po:check] проверено файлов: ${targets.length}`);
for (const r of report) console.log(r);

if (problems.length) {
  console.error("\n[po:check] ПОРЧА НАЙДЕНА:");
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log("[po:check] все po целы ✓");
