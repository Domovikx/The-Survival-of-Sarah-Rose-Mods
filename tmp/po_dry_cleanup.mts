/**
 * po_dry_cleanup.mts — одноразовая чистка po/*.po: убрать ВСЕ `#.`-комментарии
 * (тон/arc/scene/uid/label-map) из языковых файлов — они живут только в
 * template.pot (задача 2026-10-23-dry-emotion-only-in-pot). Переводы (msgstr),
 * переводческие пометы `# `, флаги `#,` и шапка файла не трогаются.
 *
 * Безопасность: round-trip через parsePo/renderPo проверен байт-в-байт для
 * всех 10 языков (tmp/roundtrip_test.mts) — правка только comments.
 *
 * ЗАПУСК (из корня репы): node tmp/po_dry_cleanup.mts [--apply]
 */
import { readFileSync, writeFileSync } from "node:fs";

import { parsePo, renderPo } from "../.opencode/skills/renpy-po/po_core.mts";

const PO_DIR = "patches/ai-voice-pack/po";
const LANGS = ["de", "es", "fr", "it", "ja", "ko", "pl", "pt", "ru", "zh"];
const apply = process.argv.includes("--apply");

let totalRemoved = 0;
for (const lang of LANGS) {
  const path = `${PO_DIR}/${lang}.po`;
  const raw = readFileSync(path, "utf-8");
  const text = raw.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const headerEnd = lines.findIndex((l, i) => i > 0 && l === "");
  const header = lines.slice(0, headerEnd);
  const entries = parsePo(text).filter((e) => e.msgid);

  let removed = 0;
  for (const e of entries) removed += e.comments.length;
  for (const e of entries) e.comments = [];

  const out = renderPo(entries, header);
  const before = Buffer.byteLength(text, "utf-8");
  const after = Buffer.byteLength(out, "utf-8");
  totalRemoved += removed;
  console.log(
    `${lang}: удалено комментариев ${removed}, ${(before / 1024 / 1024).toFixed(1)} -> ${(after / 1024 / 1024).toFixed(1)} MB`,
  );
  if (apply) writeFileSync(path, out, "utf-8");
}
console.log(apply ? `ЗАПИСАНО, всего удалено ${totalRemoved}` : `dry-run (без --apply), всего ${totalRemoved}`);
