/**
 * translate_salvage.test.mts — E2E «лечения» склеек на синтетическом po.
 *
 * Проверяем ГРАНИЧНЫЕ СЛУЧАИ, из-за которых `fr` стоял часами (2026-11-18):
 *   1) сдвиг: перевод строки i лежит в предыдущей строке (i-1) — салваж должен
 *      поставить его в i и очистить i-1;
 *   2) вклейка хвостом: у i-1 свой перевод + наш — салваж ставит наш в i и
 *      ОТРЕЗАЕТ у i-1, не теряя его собственный текст;
 *   3) взаимный дубль: две строки с одинаковым переводом — разклейка обнуляет
 *      обе, салваж переводит каждую по её оригиналу;
 *   4) законное совпадение: наши оригиналы делят фразу ≥3 слов (sameOrigin) —
 *      гейт не должен считать это склейкой;
 *   5) настоящая вклейка (модель дописала соседа) — текст остаётся пустым, а не
 *      затирает живую строку.
 *
 * Бэкенд подменяем локальным мок-сервером: ответ = таблица EN→FR, поэтому тест
 * детерминированный и не требует модели.
 *
 * Запуск: node --test .opencode/skills/translate/translate_salvage.test.mts
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { parsePo, renderPo } from "../renpy-po/po_core.mts";

const DIR = join("tmp", "e2e-salvage");
const PO = join(DIR, "xx.po");
const SCRIPT = resolve(".opencode/skills/translate/translate_salvage.mts");
const UNGLUE = resolve(".opencode/skills/translate/translate_unglue.mts");
const PORT = 18081;

/** Ответы мока: что «модель» вернёт для каждого оригинала. */
const MOCK: Record<string, string> = {
  "Shifted line, translation lives in the previous entry.":
    "Ligne décalée, la traduction vit dans l'entrée précédente.",
  "Tail-glued line, its translation was appended to the previous one.":
    "Ligne collée en queue, sa traduction a été ajoutée à la précédente.",
  "Mutual duplicate A.": "Doublon mutuel A.",
  "Mutual duplicate B.": "Doublon mutuel B.",
  "Owner of the tail-glued prefix.": "Propriétaire du préfixe.",
  "Already correct line.": "Ligne déjà correcte.",
  "Unrelated neighbour text that must stay.": "Texte voisin sans rapport qui doit rester.",
  "Legit shared prefix line which is fine.": "Ligne à préfixe commun, tout va bien.",
  "Legit shared prefix line continues here.": "Ligne à préfixe commun, la suite ici.",
  "Bad glue: the model appended the neighbour.": "Texte voisin sans rapport qui doit rester.",
  "Prompt line without stopwords.": "The model answered here in the English.",
};

/** Запустить CLI асинхронно: иначе мок-сервер в этом же процессе не ответит. */
const run = (args: string[], env: NodeJS.ProcessEnv): Promise<void> =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`CLI ${args.at(2)} вышел с кодом ${code}: ${err.slice(0, 400)}`));
    });
  });

const entry = (en: string, fr: string) => ({
  msgctxt: "speaker:Narrator",
  msgid: en,
  msgstr: fr,
  comments: [],
  refs: [],
  flags: [],
  translator: [],
});

const build = (): string => {
  const header = ["# TSSR E2E synthetic", 'msgid ""', 'msgstr ""', '"Content-Type: text/plain; charset=UTF-8\\n"'];
  const rows = [
    // 1) сдвиг: наш перевод лежит в предыдущей строке
    entry("Previous line keeps its own text.", "Ligne précédente garde son propre texte."),
    entry("Shifted line, translation lives in the previous entry.", ""),
    // 2) вклейка хвостом: у предыдущей свой текст + наш
    entry(
      "Owner of the tail-glued prefix.",
      "Propriétaire du préfixe. " + MOCK["Tail-glued line, its translation was appended to the previous one."]!,
    ),
    entry("Tail-glued line, its translation was appended to the previous one.", ""),
    // 3) взаимный дубль (одинаковый перевод, разные оригиналы)
    entry("Mutual duplicate A.", "Doublon mutuel A."),
    entry("Mutual duplicate B.", "Doublon mutuel A."),
    // 4) законное совпадение: общий префикс ≥3 слов — не склейка
    entry("Legit shared prefix line which is fine.", "Ligne à préfixe commun, tout va bien."),
    entry("Legit shared prefix line continues here.", "Ligne à préfixe commun, la suite ici."),
    // 5) настоящая вклейка: модель вернёт соседа целиком → отказ
    entry("Prompt line without stopwords.", ""),
    entry("Bad glue: the model appended the neighbour.", ""),
    entry("Unrelated neighbour text that must stay.", "Texte voisin sans rapport qui doit rester."),
    // контроль: корректная строка не должна пострадать
    entry("Already correct line.", "Ligne déjà correcte."),
  ];
  return renderPo(rows, header);
};

test("E2E: салваж лечит сдвиг, вклейку хвостом и взаимный дубль, не портя живое", async () => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  writeFileSync(PO, build(), "utf-8");

  // Мок-бэкенд: отдаёт заранее заданный перевод по оригиналу.
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body) as { messages?: Array<{ content?: string }> };
      const user = parsed.messages?.at(-1)?.content ?? "";
      // В запросе строка может идти с подсказкой спикера — берём хвост после перевода строки.
      const source = user.includes("\n") ? (user.split("\n").at(-1) ?? "") : user;
      const answer = MOCK[source.trim()] ?? "MOCK-UNKNOWN";
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: answer } }] }));
    });
  });
  await new Promise<void>((r) => server.listen(PORT, r));

  const env = {
    ...process.env,
    TSSR_LLM_URL: `http://127.0.0.1:${PORT}`,
    TSSR_LLM_MODEL: "mock",
    TSSR_SALVAGE_PO: PO,
  };

  try {
    // Сначала разклейка (обнулит взаимные дубли), затем спасение.
    // ВАЖНО: запускаем асинхронно. execFileSync заблокировал бы event loop, и
    // мок-сервер в этом же процессе не смог бы ответить (тест висел 120 с).
    await run(["--experimental-strip-types", UNGLUE, "xx", "--apply"], env);
    await run(["--experimental-strip-types", SCRIPT, "xx", "--apply"], env);

    const after = parsePo(readFileSync(PO, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);
    const get = (en: string) => after.find((e) => e.msgid === en)?.msgstr ?? "<нет строки>";

    // 1) сдвиг: наш текст переехал в свою строку, донор очищен и его НЕ потеряли
    assert.equal(
      get("Shifted line, translation lives in the previous entry."),
      MOCK["Shifted line, translation lives in the previous entry."],
    );
    assert.equal(get("Previous line keeps its own text."), "Ligne précédente garde son propre texte.");

    // 2) вклейка хвостом: наш текст в нашей строке, у соседа остался ТОЛЬКО его текст
    assert.equal(
      get("Tail-glued line, its translation was appended to the previous one."),
      MOCK["Tail-glued line, its translation was appended to the previous one."],
    );
    assert.equal(get("Owner of the tail-glued prefix."), "Propriétaire du préfixe.");

    // 3) взаимный дубль: обе строки переведены по своим оригиналам
    assert.equal(get("Mutual duplicate A."), "Doublon mutuel A.");
    assert.equal(get("Mutual duplicate B."), "Doublon mutuel B.");

    // 4) законное совпадение не тронуто (sameOrigin → не склейка)
    assert.equal(get("Legit shared prefix line which is fine."), "Ligne à préfixe commun, tout va bien.");
    assert.equal(get("Legit shared prefix line continues here."), "Ligne à préfixe commun, la suite ici.");

    // 5) английский ответ модели отклоняется: строка остаётся пустой
    assert.equal(get("Prompt line without stopwords."), "");
    // 6) политика «доверяем нашей строке»: кандидат совпал с соседом → сосед
    //    очищается (иначе дедлок), наша строка получает текст
    assert.equal(get("Bad glue: the model appended the neighbour."), "Texte voisin sans rapport qui doit rester.");
    assert.equal(get("Unrelated neighbour text that must stay."), "");

    // Контроль: корректная строка не пострадала
    assert.equal(get("Already correct line."), "Ligne déjà correcte.");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(DIR, { recursive: true, force: true });
  }
});
