/**
 * emotion_audit.mts — аудит качества `#. emotion:` (тон диктора).
 *
 * Смотрит ДВЕ вещи (скилл .opencode/skills/emotion-tag):
 *   1. нарушения ПРАВИЛ формата (пусто/кириллица/none/длина/регистр/кавычки);
 *   2. однородность — массовый перекос одним тоном и мусорный хвост LLM.
 *
 * Источник тона: po/template.pot (единственный холд, emotions.json удалён).
 *
 * Запуск:
 *   node emotion_audit.mts              # отчёт по шаблону
 *   node emotion_audit.mts --draft      # то же для tmp/emotions_tagged.json
 *                                        #   (проверка ДО overlay в potgen)
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { voicedEntries, EMOTIONS_JSON, VIOLATION_NAMES, violationsOf } from "./emotion_tag.mts";

export interface EmotionRow {
  /** Текущий тон (из POT или из черновика); null = тон отсутствует. */
  emo: string | null;
  /** Сообщение фразы (для примеров в отчёте). */
  sample: string;
  /** Категория (dialogue/narration) — все строки входа уже озвучиваемые. */
  category: string;
  /** Есть ли миграционный слой `#. emotion_new:` (только POT-режим). */
  hasNew?: boolean;
}

export interface AuditReport {
  total: number;
  /** Нарушения правил: имя -> строки. */
  violations: Record<string, EmotionRow[]>;
  unique: number;
  /** [тон, число] по убыванию. */
  top: Array<[string, number]>;
  /** Тонов, встреченных ровно один раз (мусорный хвост LLM). */
  singletons: number;
  /** Доля самого частого тона, % от total. */
  topShare: number;
  /** Сколько строк уже переведено на новый тон `emotion_new` (миграция). */
  migrated?: number;
}

// Правила качества тона живут в emotion_tag.mts (общие с разметчиком: он же
// пере-размечает нарушителей флагом --only-invalid) — направление импорта
// emotion_audit -> emotion_tag, цикла нет. Здесь — re-export для тестов.
export { violationsOf, VIOLATION_NAMES } from "./emotion_tag.mts";

export function auditEmotions(rows: EmotionRow[]): AuditReport {
  const violations: Record<string, EmotionRow[]> = Object.fromEntries(VIOLATION_NAMES.map((n) => [n, []]));
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const v of violationsOf(r.emo)) violations[v].push(r);
    const key = (r.emo ?? "").trim();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const migrated = rows.some((r) => r.hasNew !== undefined) ? rows.filter((r) => r.hasNew).length : undefined;
  return {
    total: rows.length,
    violations,
    unique: counts.size,
    top,
    singletons: top.filter(([, n]) => n === 1).length,
    topShare: rows.length ? (100 * (top[0]?.[1] ?? 0)) / rows.length : 0,
    migrated,
  };
}

/** Строки отчёта для консоли (чистая — тестируется). */
export function formatReport(r: AuditReport, title: string): string[] {
  const out: string[] = [`=== ${title} ===`, `озвучиваемых строк: ${r.total}`];
  out.push("", "--- нарушения правил ---");
  for (const [name, rows] of Object.entries(r.violations)) {
    out.push(`  ${String(rows.length).padStart(6)}  ${name}`);
    for (const s of rows.slice(0, 3)) out.push(`            «${s.emo ?? ""}» <- ${s.sample}`);
  }
  const bad = Object.values(r.violations).reduce((s, v) => s + v.length, 0);
  out.push(`  итого нарушений записей: ${bad}`);
  if (r.migrated !== undefined) {
    out.push("", "--- миграция emotion_new ---");
    out.push(
      `  на новый тон переведено: ${r.migrated} из ${r.total} (${((100 * r.migrated) / Math.max(r.total, 1)).toFixed(1)}%)`,
    );
    out.push("  (старый `#. emotion:` при этом не трогается — плавный переход)");
  }
  out.push("", "--- однородность ---");
  out.push(`  уникальных тонов: ${r.unique}`);
  out.push(`  топ-1 «${r.top[0]?.[0] ?? "-"}»: ${r.top[0]?.[1] ?? 0} (${r.topShare.toFixed(1)}%)`);
  out.push(
    `  тонов «один раз»: ${r.singletons} (${((100 * r.singletons) / Math.max(r.unique, 1)).toFixed(0)}% словаря)`,
  );
  out.push("  топ-8:");
  for (const [emo, n] of r.top.slice(0, 8)) {
    out.push(`    ${String(n).padStart(6)}  ${emo.slice(0, 70)}`);
  }
  return out;
}

function main(): void {
  const draft = process.argv.includes("--draft");
  let rows: EmotionRow[];
  if (draft) {
    const draftMap = JSON.parse(readFileSync(EMOTIONS_JSON, "utf-8")) as Record<string, string>;
    rows = voicedEntries().map((e) => ({
      emo: draftMap[e.uid] ?? null,
      sample: e.old.slice(0, 60),
      category: e.category,
    }));
  } else {
    rows = voicedEntries().map((e) => ({
      emo: e.emotion ?? null,
      sample: e.old.slice(0, 60),
      category: e.category,
      // миграция: сколько записей уже несут слой `#. emotion_new:`
      hasNew: !!e.emotionNew,
    }));
  }
  const report = auditEmotions(rows);
  console.log(formatReport(report, draft ? `ЧЕРНОВИК ${EMOTIONS_JSON}` : "po/template.pot").join("\n"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
