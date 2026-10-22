/**
 * check_es.mts — механический чекер es.po перед/после перевода (скилл-ревьюер).
 *
 * Regex-гарды по чек-листу skill-review-es-po: медицинщина в сценах,
 * региональные мины (concha/coger/voseo/vosotros), непереведённое
 * (msgstr == msgid), раздутие длины. Судейство (смысл/род/интонация) —
 * за ревьюером; тут только детерминированная часть.
 *
 * Запуск: node .opencode/skills/skill-review-es-po/check_es.mts [--po FILE] [--limit N]
 * Выход: отчёт в stdout, код 0 всегда (report-only).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { parsePo } from "../renpy-po/po_core.mts";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SKILL_DIR, "..", "..", "..");
const DEFAULT_PO = join(REPO_ROOT, "patches", "ai-voice-pack", "po", "es.po");

/** Гарды: [тип, severity, regex]. severity: blocker | warn. */
const GUARDS: [string, "blocker" | "warn", RegExp][] = [
  ["медицинский_термин", "warn", /\b(penetrar\w*|pene|vagina|testículo\w*|líquido seminal)\b/i],
  ["региональная_мина_concha", "blocker", /\bconcha\b/i],
  ["coger_без_ревью", "warn", /\bcoger\b|\bcoge\b|\bcogen\b|\bcogí\w*/i],
  ["voseo", "warn", /\b(vos|hablás|tenés|querés|podés|sos|andás|decís|ponés|venís|salís)\b/i],
  ["vosotros", "warn", /\b(vosotros|vosotras|habláis|tenéis|coméis)\b|\wéis\b/i],
];

interface Flag {
  type: string;
  severity: string;
  msgid: string;
  msgstr: string;
  hit: string;
}

function main(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { po: { type: "string" }, limit: { type: "string" } },
  });
  const poPath = values.po ?? DEFAULT_PO;
  const limit = values.limit ? parseInt(values.limit, 10) : 50;

  const entries = parsePo(readFileSync(poPath, "utf8")).filter((e) => e.msgid);
  const translated = entries.filter((e) => e.msgstr);
  const untranslated = entries.filter((e) => !e.msgstr);

  const flags: Flag[] = [];
  for (const e of translated) {
    const t = e.msgstr.trim();
    if (/^[\W\d]+$/u.test(e.msgid)) continue; // плейсхолдеры: <>, %s — ок
    if (t === e.msgid.trim()) {
      flags.push({ type: "непереведённое", severity: "warn", msgid: e.msgid, msgstr: t, hit: t.slice(0, 60) });
      continue;
    }
    for (const [type, severity, re] of GUARDS) {
      const m = t.match(re);
      if (m) flags.push({ type, severity, msgid: e.msgid, msgstr: t, hit: m[0] });
    }
    if (t.length > e.msgid.length * 2.5 && e.msgid.length > 40) {
      flags.push({
        type: "раздутие_длины",
        severity: "warn",
        msgid: e.msgid,
        msgstr: t,
        hit: `${e.msgid.length}→${t.length}`,
      });
    }
  }

  const byType = flags.reduce<Record<string, number>>((a, f) => ((a[f.type] = (a[f.type] || 0) + 1), a), {});
  const blockers = flags.filter((f) => f.severity === "blocker");

  console.log(`es.po: записей ${entries.length}, переведено ${translated.length}, пусто ${untranslated.length}`);
  console.log(`флагов: ${flags.length} (blocker: ${blockers.length})`);
  for (const [type, n] of Object.entries(byType)) console.log(`  ${type}: ${n}`);
  if (flags.length) {
    console.log(`\nпримеры (до ${limit}):`);
    for (const f of flags.slice(0, limit)) {
      console.log(
        `  [${f.severity}] ${f.type} | ${f.hit}\n    EN: ${f.msgid.slice(0, 100)}\n    ES: ${f.msgstr.slice(0, 100)}`,
      );
    }
  }
}

main();
