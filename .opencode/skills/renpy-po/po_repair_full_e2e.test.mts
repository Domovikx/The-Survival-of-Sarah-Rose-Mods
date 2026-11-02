/**
 * E2E авто-правки: живой прогон po_repair_full на ФИКСТУРЕ (боевой po не трогается).
 *
 * Цепочка целиком: классификация → промпт правки → модель → детерминированные шлюзы
 * checkTranslation → судья ≥9 → АТОМАРНАЯ запись в .po → JSONL {repaired}.
 * В фикстуру сажаем заведомо мусорный перевод (кириллица в es.po) — судья обязан
 * отклонить, авто-правка обязана заменить на валидный испанский и повторно пройти судью.
 *
 * Запуск: TSSR_PO_E2E=1 node --test po_repair_full_e2e.test.mts (нужен поднятый бэкенд).
 * Ломается громко (assert), а не молча: молчаливый пропуск правки = баг, который
 * вылез бы только в боевом ru.po.
 */
import assert from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";

import { parsePo } from "./po_core.mts";

const ON = process.env.TSSR_PO_E2E === "1";
const REPO = join(import.meta.dirname, "..", "..", "..");
const SCRIPT = join(import.meta.dirname, "po_repair_full.mts");
const JSONL = join(REPO, "tmp", "po_repair_full_es.jsonl");
const FAILED = join(REPO, "tmp", "po_repair_full_es.failed.txt");

const FIXTURE_HEADER = `# fixture для e2e авто-правки (генерируется тестом)
msgid ""
msgstr ""
"Project-Id-Version: repair-e2e 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Content-Transfer-Encoding: 8bit\\n"
`;

const BAD_MSGID = "The knight drew his sword and charged at the dragon without fear.";
/** Мусор: кириллица в испанском файле — судья обязан отклонить (score < 9). */
const BAD_MSGSTR = "КУРЯЩИЙ СЛОН ЛЕТАЛ ПО ОБЛАКАМ ВЧЕРА ВЕЧЕРОМ МЕДЛЕННО.";

function runRepair(poDir: string): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [SCRIPT, "--lang", "es", "--concurrency", "1", "--limit", "3"], {
      env: { ...process.env, TSSR_PO_DIR: poDir },
      cwd: REPO,
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ code, out }));
  });
}

test("e2e: авто-правка находит мусорный перевод, чинит и записывает в .po", { skip: !ON }, async () => {
  // Защита от затирания чужих данных: боевые артефакты es не должны существовать.
  assert.ok(!existsSync(JSONL), `обнаружен существующий ${JSONL} — сначала разберись с ним`);
  assert.ok(!existsSync(FAILED), `обнаружен существующий ${FAILED} — сначала разберись с ним`);

  const poDir = mkdtempSync(join(tmpdir(), "repair-e2e-po-"));
  const poFile = join(poDir, "es.po");
  writeFileSync(
    poFile,
    // Пустая строка между заголовком и записью ОБЯЗАТЕЛЬНА: poHeaderLines берёт
    // всё до первого \n\n — без неё «заголовок» схлопывает весь файл (поймано e2e).
    `${FIXTURE_HEADER}\n\n#: fixture\nmsgctxt "narration"\nmsgid "${BAD_MSGID}"\nmsgstr "${BAD_MSGSTR}"\n`,
    "utf-8",
  );

  try {
    const { code, out } = await runRepair(poDir);
    assert.equal(code, 0, `скрипт упал:\n${out}`);

    // 1. Файл ИЗМЕНЁН: мусор заменён, msgid цел, заголовок пережил roundtrip.
    const all = parsePo(readFileSync(poFile, "utf-8"));
    const entries = all.filter((e) => e.msgid); // заголовок (msgid "") — не запись
    assert.equal(entries.length, 1, `запись одна, блоков всего ${all.length}`);
    assert.equal(entries[0].msgid, BAD_MSGID, "msgid не должен измениться");
    assert.notEqual(entries[0].msgstr, BAD_MSGSTR, "мусорный перевод ДОЛЖЕН быть заменён");
    assert.ok(entries[0].msgstr.trim().length > 0, "новый перевод не пустой");
    assert.ok(!/[а-яё]/i.test(entries[0].msgstr), "новый перевод без кириллицы (es)");

    // 2. Статус в JSONL: repaired, судья принял (≥9 — порог по умолчанию).
    const rows = readFileSync(JSONL, "utf-8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const rep = rows.find((r) => r.msgid === BAD_MSGID && r.repaired === true);
    assert.ok(rep, `в JSONL нет repaired-записи:\n${out}`);
    assert.ok((rep!.score as number) >= 9, `кандидат не прошёл судью: score=${rep!.score}`);
    assert.equal(rep!.old, BAD_MSGSTR, "в old зафиксирован прежний мусор");

    // 3. Счётчики в отчёте: правка точно засчитана.
    assert.match(out, /ИСПРАВЛЕНО В ФАЙЛ 1/, `отчёт не содержит счётчик правок:\n${out}`);
  } finally {
    rmSync(poDir, { recursive: true, force: true });
    rmSync(JSONL, { force: true });
    rmSync(FAILED, { force: true });
  }
});
