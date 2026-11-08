/**
 * Уборка инфраструктурных отказов из журнала и failed.txt (инцидент 2026-11-03):
 * транзиентный HTTP 400 от слотов LM Studio пометил строки repair_failed —
 * они должны пересудиться, а в failed.txt остаться только реальные дефекты.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { isInfraErr } from "../.opencode/skills/renpy-po/po_repair_full.mts";

const LANG = process.argv[2] ?? "ru";
const jsonlPath = `tmp/po_repair_full_${LANG}.jsonl`;
const failedPath = `tmp/po_repair_full_${LANG}.failed.txt`;

interface Row {
  msgid?: string;
  ok?: boolean;
  repaired?: boolean;
  human?: boolean;
  repair_failed?: boolean;
  err?: string;
  error?: string;
  issues?: string[];
}

const rows = readFileSync(jsonlPath, "utf-8")
  .split("\n")
  .filter(Boolean)
  .flatMap<Row>((l) => {
    try {
      return [JSON.parse(l) as Row];
    } catch {
      return [];
    }
  });

const isFailure = (r: Row): boolean => r.ok !== true && !r.repaired && !r.human;
const infra = (r: Row): boolean => isInfraErr(`${r.err ?? ""} ${(r.issues ?? []).join("; ")} ${r.error ?? ""}`);

const bad = rows.filter((r) => isFailure(r) && infra(r));
const kept = rows.filter((r) => !(isFailure(r) && infra(r)));
writeFileSync(jsonlPath, kept.length ? `${kept.map((r) => JSON.stringify(r)).join("\n")}\n` : "", "utf-8");
console.log(`журнал: ${rows.length} -> ${kept.length} (снято инфра-отказов: ${bad.length})`);
for (const r of bad.slice(0, 5)) console.log(`   ${r.msgid?.slice(0, 60)}`);

// failed.txt: оставляем только реальные дефекты.
let failedText = "";
try {
  failedText = readFileSync(failedPath, "utf-8");
} catch {
  /* файла нет */
}
if (failedText) {
  const blocks = failedText.split("\n\n").filter((b) => b.trim());
  const real = blocks.filter((b) => !isInfraErr(b));
  writeFileSync(failedPath, real.length ? `${real.map((b) => b.trimEnd()).join("\n\n")}\n` : "", "utf-8");
  console.log(`failed.txt: ${blocks.length} -> ${real.length} блоков (убрано инфра: ${blocks.length - real.length})`);
}
