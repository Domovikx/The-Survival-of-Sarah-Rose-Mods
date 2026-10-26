import assert from "node:assert";
import { test } from "node:test";
import { decide, findLastRequest, formatIdle, parseLastRequest } from "./lmstudio_idle.mts";

const LOG = [
  "[2026-10-26 08:06:18][DEBUG] Received request: POST to /v1/chat/completions with body {",
  '  "model": "qwen/qwen3.5-9b",',
  "[2026-10-26 08:06:19][INFO][qwen/qwen3.5-9b] Prompt processing progress: 100.0%",
  "[2026-10-26 09:14:02][DEBUG] Received request: POST to /v1/embeddings with body {",
  "[2026-10-26 10:00:00][DEBUG] something else entirely",
].join("\n");

test("parseLastRequest: берёт последний запрос, а не первый", () => {
  const ts = parseLastRequest(LOG);
  assert.ok(ts, "метка времени должна найтись");
  assert.equal(ts.getFullYear(), 2026);
  assert.equal(ts.getMonth(), 9); // октябрь = 9
  assert.equal(ts.getDate(), 26);
  assert.equal(ts.getHours(), 9);
  assert.equal(ts.getMinutes(), 14);
});

test("parseLastRequest: без запросов — null, мусор не ломает", () => {
  assert.equal(parseLastRequest(""), null);
  assert.equal(parseLastRequest("[2026-10-26 09:00:00][INFO] тишина в эфире"), null);
  assert.equal(parseLastRequest("Received request: POST to /v1/chat/completions"), null); // нет метки времени
  assert.equal(parseLastRequest("[несеверный][DEBUG] Received request: POST to /v1/x"), null);
});

test("decide: все исходы, включая 'busy' (спас от аварии 2026-10-26)", () => {
  const now = Date.parse("2026-10-26T12:00:00");
  const t10 = new Date(now - 10 * 60_000);
  const t05 = new Date(now - 5 * 60_000);
  const thr = 10 * 60_000;

  assert.equal(decide({ loaded: false, busy: false, lastRequest: t10 }, thr, now), "no-model");
  assert.equal(decide({ loaded: true, busy: false, lastRequest: null }, thr, now), "unknown");
  assert.equal(decide({ loaded: true, busy: false, lastRequest: t10 }, thr, now), "idle");
  assert.equal(decide({ loaded: true, busy: false, lastRequest: t05 }, thr, now), "active");
  // на границе: 9:59 — ещё активен
  assert.equal(decide({ loaded: true, busy: false, lastRequest: new Date(now - 599_000) }, thr, now), "active");
  // ГЛАВНОЕ: лог может врать (старую метку), но статус генерации — нет.
  // Без busy-ветки демон снял модель посреди очереди (инцидент 2026-10-26).
  assert.equal(
    decide({ loaded: true, busy: true, lastRequest: new Date(now - 3 * 3600_000) }, thr, now),
    "busy",
    "идёт генерация — выгружать нельзя при каком угодно простом логе",
  );
});

test("formatIdle: читаемый вид", () => {
  assert.equal(formatIdle(5 * 60_000), "5м");
  assert.equal(formatIdle(59 * 60_000), "59м");
  assert.equal(formatIdle(65 * 60_000), "1ч 05м");
  assert.equal(formatIdle(120 * 60_000), "2ч 00м");
});

test("findLastRequest: читает свежий файл, при пустом хвосте — предыдущий", () => {
  const calls: string[] = [];
  const files = ["new.log", "old.log"];
  const content: Record<string, string> = {
    // в новом только хвост без запросов
    "new.log": "[2026-10-26 11:00:00][INFO] прогрев слота",
    "old.log": LOG,
  };
  const ts = findLastRequest(
    files,
    (p) => {
      calls.push(`tail:${p}`);
      return content[p] ?? "";
    },
    (p) => {
      calls.push(`full:${p}`);
      return content[p] ?? "";
    },
  );
  assert.ok(ts, "должен найти запрос в старом файле");
  assert.equal(ts?.getHours(), 9);
  assert.deepEqual(calls, ["tail:new.log", "full:new.log", "tail:old.log"], "хвост -> полное чтение -> старый файл");
});

test("findLastRequest: вообще нет данных — null (и решение будет 'unknown', не 'idle')", () => {
  const ts = findLastRequest(
    ["a.log", "b.log"],
    () => "просто текст",
    () => "тоже просто текст",
  );
  assert.equal(ts, null);
  assert.equal(
    decide({ loaded: true, busy: false, lastRequest: ts }, 0, Date.now()),
    "unknown",
    "даже нулевой порог не должен выгружать вслепую",
  );
});

/** Фейковый читатель: возвращает содержимое из словаря по пути. */
const pick = (map: Record<string, string>) => (p: string) => map[p] ?? "";

test("findLastRequest: МАКСИМУМ среди файлов, порядок не важен (инцидент 2026-10-26)", () => {
  // Файлы пришли «старым первым» — старая логика вернула трёхчасовой
  // более старую метку, и демон снял модель посреди работы очереди.
  const old = "[2026-10-26 09:25:00][DEBUG] Received request: POST to /v1/chat/completions";
  const fresh = "[2026-10-26 12:23:56][DEBUG] Received request: POST to /v1/chat/completions";
  const both = pick({ "old.log": old, "new.log": fresh });

  const a = findLastRequest(
    ["old.log", "new.log"],
    pick({ "old.log": old, "new.log": old }),
    pick({ "old.log": old, "new.log": old }),
  );
  const b = findLastRequest(["old.log", "new.log"], both, both);
  assert.equal(a?.getHours(), 9, "в первом порядке тоже находит, но это НЕ максимум");
  assert.equal(b?.getHours(), 12, "свежий файл отдаёт 12ч");

  // а максимум берётся независимо от порядка входа
  const c = findLastRequest(["new.log", "old.log"], both, both);
  assert.equal(c?.getHours(), 12, "порядок входа не влияет");
});
