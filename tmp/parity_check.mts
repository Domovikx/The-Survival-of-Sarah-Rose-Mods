/**
 * tmp/parity_check.mts — одноразовая эмпирическая сверка паритета
 * build_pack.py ↔ build_pack.mts (задача порта, НЕ коммитится).
 *
 * Обе сборки идут по ОДНОЙ замороженной копии audio/ (живая очередь меняет
 * файлы между сборками — иначе ложные расхождения). Сравниваем: имена записей
 * (сохраняя порядок!) + sha256 несжатых байтов каждой записи.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as bp from "../patches/ai-voice-pack/tools/build/build_pack.mts";
import { readZip } from "../patches/ai-voice-pack/tools/build/zip.mts";

const REPO = resolve(fileURLToPath(import.meta.url), "..", "..");
const WORK = join(REPO, "tmp", "parity_work");
const FROZEN = join(WORK, "frozen");
const PY_OUT = join(WORK, "py");
const TS_OUT = join(WORK, "ts");

rmSync(WORK, { recursive: true, force: true });
mkdirSync(join(FROZEN, "audio"), { recursive: true });
mkdirSync(PY_OUT, { recursive: true });
mkdirSync(TS_OUT, { recursive: true });

// 1. Заморозка audio/ — источник voice-паков.
cpSync(join(bp.PATCH, "audio"), join(FROZEN, "audio"), { recursive: true });

// 2. python-сборка (эталон) по замороженной копии.
const pyDriver = join(WORK, "parity_py_build.py");
writeFileSync(
  pyDriver,
  [
    "import sys",
    "from pathlib import Path",
    "sys.path.insert(0, sys.argv[1])",
    "import build_pack",
    "frozen, out = Path(sys.argv[2]), Path(sys.argv[3])",
    "build_pack.VOICE_LANGS = {l: frozen / 'audio' / l for l in build_pack.VOICE_LANGS}",
    "build_pack.build_main(out)",
    "for lang in sorted(build_pack.VOICE_LANGS):",
    "    build_pack.build_voice(lang, out)",
    "",
  ].join("\n"),
);
const py = spawnSync("python", [pyDriver, join(bp.PATCH, "tools", "build"), FROZEN, PY_OUT], {
  encoding: "utf-8",
  cwd: REPO,
});
if (py.status !== 0) {
  console.error(py.stdout, py.stderr);
  throw new Error(`python-сборка упала: ${py.status}`);
}

// 3. ts-сборка по той же замороженной копии.
for (const lang of Object.keys(bp.VOICE_LANGS)) {
  bp.VOICE_LANGS[lang] = join(FROZEN, "audio", lang);
}
bp.buildMain(TS_OUT);
for (const lang of Object.keys(bp.VOICE_LANGS).toSorted()) {
  bp.buildVoice(lang, TS_OUT);
}

// 4. Сравнение: имена/порядок + sha256 несжатых байтов.
let zips = 0;
let entries = 0;
let diffs = 0;
const report: string[] = [];
const names = [
  "TSSR-AI-Voice-Pack-main.zip",
  ...Object.keys(bp.VOICE_LANGS)
    .toSorted()
    .map((l) => `TSSR-AI-Voice-Pack-voice-${l}.zip`),
];
for (const name of names) {
  const za = readZip(join(PY_OUT, name));
  const zb = readZip(join(TS_OUT, name));
  const a = za.names.map((n) => [n, createHash("sha256").update(za.read(n)).digest("hex")]);
  const b = zb.names.map((n) => [n, createHash("sha256").update(zb.read(n)).digest("hex")]);
  zips++;
  entries += a.length;
  const problems: string[] = [];
  if (a.length !== b.length) problems.push(`записей: py=${a.length} ts=${b.length}`);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i][0] !== b[i][0]) problems.push(`имя #${i}: py=${a[i][0]} ts=${b[i][0]}`);
    else if (a[i][1] !== b[i][1]) problems.push(`байты #${i} ${a[i][0]}: py=${a[i][1].slice(0, 12)} ts=${b[i][1].slice(0, 12)}`);
  }
  diffs += problems.length;
  report.push(`${name}: ${a.length} записей — ${problems.length ? "РАСХОЖДЕНИЯ" : "OK"}`);
  for (const p of problems.slice(0, 10)) report.push(`   ! ${p}`);
}
console.log(report.join("\n"));
console.log(`\nИТОГ: ${zips} зипов, ${entries} записей, расхождений: ${diffs}`);
rmSync(WORK, { recursive: true, force: true });
process.exit(diffs ? 1 : 0);
