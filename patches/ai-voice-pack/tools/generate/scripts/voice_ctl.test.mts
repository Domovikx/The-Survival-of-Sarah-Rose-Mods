/** Тесты пульта voice_ctl.mts — только чистые хелперы + CLI-парсер, без процессов. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VOX_LANGS,
  countSaved,
  formatAge,
  isQueueProc,
  isWorkerProc,
  logTmpl,
  main,
  normLangs,
  parseCtlCli,
  parseLogState,
  parseProgressLine,
  pauseTmpl,
} from "./voice_ctl.mts";

test("normLangs: cosy — только ru/en, мусор падает", () => {
  assert.deepEqual(normLangs(undefined), ["ru", "en"]);
  assert.deepEqual(normLangs("all"), ["ru", "en"]);
  assert.deepEqual(normLangs("ru"), ["ru"]);
  assert.deepEqual(normLangs("en"), ["en"]);
  assert.throws(() => normLangs("de"));
});

test("normLangs: контур vox принимает все 11 po-языков, cosy — только ru/en", () => {
  assert.deepEqual(normLangs(null, "vox"), [...VOX_LANGS]);
  assert.deepEqual(normLangs("all", "vox"), [...VOX_LANGS]);
  assert.equal(VOX_LANGS.length, 11);
  for (const lang of ["ru", "en", "de", "es", "fr", "it", "ja", "ko", "pl", "pt", "zh"]) {
    assert.deepEqual(normLangs(lang, "vox"), [lang]);
  }
  assert.throws(() => normLangs("xx", "vox"));
  // 'de' в vox допустим, а в cosy — нет
  assert.deepEqual(normLangs("de", "vox"), ["de"]);
});

test("isQueueProc: bash voice_queue.sh (cosy) | node vox_queue.mts (vox) — по языку", () => {
  const bash: [string, string] = ["bash.exe", "bash /c tools/generate/scripts/voice_queue.sh ru"];
  const nodeRu: [string, string] = ["node.exe", "node tools/generate/scripts/vox_queue.mts ru"];
  const nodeDe: [string, string] = ["node.exe", "node tools/generate/scripts/vox_queue.mts de"];
  assert.ok(isQueueProc(...bash, "ru"));
  assert.ok(!isQueueProc(...bash, "en")); // язык другой
  assert.ok(!isQueueProc(...bash, "ru", "vox")); // это cosy-очередь
  assert.ok(isQueueProc(...nodeRu, "ru", "vox"));
  assert.ok(isQueueProc(...nodeDe, "de", "vox"));
  assert.ok(!isQueueProc(...nodeRu, "de", "vox")); // язык другой
  assert.ok(!isQueueProc(...nodeRu, "ru")); // vox в cosy не считается
});

test("isWorkerProc: пауза морозит оркестратор (voice_batch | voxcpm_bench) + --lang", () => {
  const cosy = "node voice_batch.mts --lang ru --engine cosyvoice3";
  const vox = "node voxcpm_bench.mts --lang es --arc WarArc --picks 99999 --resume";
  assert.ok(isWorkerProc(cosy, "ru"));
  assert.ok(!isWorkerProc(cosy, "en"));
  assert.ok(!isWorkerProc(cosy, "ru", "vox"));
  assert.ok(isWorkerProc(vox, "es", "vox"));
  assert.ok(!isWorkerProc(vox, "ru", "vox"));
  assert.ok(!isWorkerProc(vox, "es")); // vox-бенч в cosy не считается
  // шим (python cosyworker/voxcpmworker) — не оркестратор, без --lang
  assert.ok(!isWorkerProc("python cosyworker.py --device cuda", "ru"));
});

test("logTmpl/pauseTmpl: у контуров разные шаблоны (пауза не путается)", () => {
  assert.ok(logTmpl("vox").includes("vox_gen_"));
  assert.ok(logTmpl("cosy").includes("gen_all_"));
  assert.notEqual(logTmpl("vox"), logTmpl("cosy"));
  assert.ok(pauseTmpl("vox").includes("vox"));
  assert.notEqual(pauseTmpl("vox"), pauseTmpl("cosy"));
});

test("parseProgressLine", () => {
  assert.deepEqual(parseProgressLine("[5139/5207] 1633b069 UnionKingdom Sarah: текст"), [5139, 5207]);
  assert.equal(parseProgressLine("  saved ... wav (2.7s)"), null);
  assert.equal(parseProgressLine("=== START ru Prologue 13:46 ==="), null);
  assert.equal(parseProgressLine(""), null);
});

test("parseLogState: активная арка = последний START без DONE, прогресс = последний [n/m]", () => {
  const text =
    "=== START ru Prologue 07:25 ===\n" +
    "=== DONE ru Prologue 07:25 ===\n" +
    "=== START ru UnionKingdom 07:26 ===\n" +
    "[5138/5207] fa38ff35 UnionKingdom Sarah: текст\n" +
    "[5139/5207] 1633b069 UnionKingdom Sarah: текст\n";
  const [arc, prog] = parseLogState(text);
  assert.equal(arc, "UnionKingdom");
  assert.deepEqual(prog, [5139, 5207]);
  // повторный вызов — регресс statefulness-регэкса (lastIndex)
  assert.deepEqual(parseLogState(text), [arc, prog]);
});

test("parseLogState: DONE-арка не активна; пустой лог", () => {
  const text = "=== START ru UnionKingdom 16:47 ===\n=== DONE ru UnionKingdom 07:22 ===\n";
  assert.deepEqual(parseLogState(text), [null, null]);
  assert.deepEqual(parseLogState(""), [null, null]);
});

test("formatAge", () => {
  assert.equal(formatAge(12), "12 сек");
  assert.equal(formatAge(300), "5 мин");
  assert.equal(formatAge(7200), "2 ч");
  assert.equal(formatAge(259200), "3 дн");
});

test("countSaved: строки '  saved ' из лога voice_batch", () => {
  assert.equal(countSaved(""), 0);
  const text =
    "[1/2] a Arc Who: текст\n" +
    "  saved out/a.wav (1.0s), eta ~1 мин\n" +
    "[2/2] b Arc Who: текст\n" +
    "  saved out/b.wav (2.0s), eta ~0 мин\n";
  assert.equal(countSaved(text), 2);
  assert.equal(countSaved("[1/2] a Arc Who: текст\n"), 0);
});

test("parseCtlCli: команды, --vox и vox-* включают vox-контур", () => {
  assert.equal(parseCtlCli(["status", "ru"]).cmd, "status");
  assert.equal(parseCtlCli(["status", "ru"]).lang, "ru");
  assert.equal(parseCtlCli(["vox-start", "de"]).kind, "vox");
  assert.equal(parseCtlCli(["vox-start", "de"]).lang, "de");
  assert.equal(parseCtlCli(["logs", "--vox", "--lang", "fr"]).kind, "vox");
  assert.equal(parseCtlCli(["logs", "--lang", "fr"]).kind, "cosy");
  assert.equal(parseCtlCli(["soft-stop", "en", "--timeout", "120"]).timeout, 120);
  assert.equal(parseCtlCli(["watch", "--interval", "10"]).interval, 10);
  assert.equal(parseCtlCli(["logs", "-n", "5"]).n, 5);
  assert.throws(() => parseCtlCli(["status", "--blya"]));
});

test("main: --help и неизвестная команда — без процессов", async () => {
  // HELP-ветка возвращает 0, мусорная команда — 1 (обе печатают help, без FS/процессов)
  const log = console.log;
  console.log = () => {};
  try {
    assert.equal(await main(["--help"]), 0);
    assert.equal(await main(["бяка"]), 1);
  } finally {
    console.log = log;
  }
});
