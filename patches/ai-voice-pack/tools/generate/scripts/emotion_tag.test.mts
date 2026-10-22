/**
 * Тесты emotion_tag.mts (порт python emotion_tag.py): эвристика RULES,
 * LLM-клиент (мок fetch), сортировка черновика.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { llmAsk, tagPhrase, writeDraft } from "./emotion_tag.mts";

// --- эвристика -------------------------------------------------------------

test("tagPhrase: первое подходящее правило (RU)", () => {
  assert.equal(tagPhrase("Убью тебя, тварь!", ""), "Angrily, with contempt");
  assert.equal(tagPhrase("Замолчи! Прекрати!!!", ""), "Loudly, with intensity");
  assert.equal(tagPhrase("Почему ты здесь?", ""), "Questioningly, with curiosity");
  assert.equal(tagPhrase("Дай мне своё тело, люблю твои груди", ""), "In a soft intimate whisper, with desire");
  assert.equal(tagPhrase("Больно, боюсь, помогите!", ""), "Fearfully, with trembling pleading");
  assert.equal(tagPhrase("Ура, я счастлива!", ""), "Happily, with warmth");
  assert.equal(tagPhrase("Конечно же, ну да, прелесть какая", ""), "Sarcastically, with a dry smirk");
  assert.equal(tagPhrase("Тихо, шепну тебе на ухо", ""), "In a hushed whisper");
  assert.equal(tagPhrase("Встань на колени и слушай меня!", ""), "With commanding authority");
  assert.equal(tagPhrase("Прости, прошу прощения", ""), "Apologetically, with regret");
  assert.equal(tagPhrase("Смею над тобой посмеяться, ухмылка", ""), "With a mocking chuckle");
});

test("tagPhrase: нейтральная фраза без тона (модель берёт тон из текста)", () => {
  assert.equal(tagPhrase("Он хлопнул себя по бёдрам.", "He slapped his thighs."), null);
});

test("tagPhrase: EN-фраза тоже ловится (каталог ru+en)", () => {
  assert.equal(tagPhrase(null, "Why would you do that?"), "Questioningly, with curiosity");
});

// --- LLM-клиент (мок fetch) ------------------------------------------------

function mockFetch(responses: Array<{ ok?: boolean; content?: string }>): typeof fetch {
  let i = 0;
  return (async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    if (!r.ok && r.content === undefined) return { ok: false, status: 500 } as Response;
    return {
      ok: r.ok ?? true,
      json: async () => ({ choices: [{ message: { content: r.content ?? "" } }] }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

test("llmAsk: ответ чистится (точки, обёртка), 'none' -> null", async () => {
  const f = mockFetch([{ content: "  Curiously observing.  " }]);
  assert.equal(await llmAsk("http://x", "m", "line", { fetchImpl: f, tries: 1 }), "Curiously observing");
  const f2 = mockFetch([{ content: "none" }]);
  assert.equal(await llmAsk("http://x", "m", "line", { fetchImpl: f2, tries: 1 }), null);
});

test("llmAsk: ретраи (2 падения -> успех на 3-й)", async () => {
  const f = mockFetch([
    { ok: false, content: undefined },
    { ok: false, content: undefined },
    { content: "With bored indifference" },
  ]);
  assert.equal(
    await llmAsk("http://x/", "m", "line", { fetchImpl: f, tries: 3, delayMs: 1 }),
    "With bored indifference",
  );
});

test("llmAsk: все попытки умерли -> null", async () => {
  const f = mockFetch([{ ok: false, content: undefined }]);
  assert.equal(await llmAsk("http://x", "m", "line", { fetchImpl: f, tries: 2, delayMs: 1 }), null);
});

// --- черновик ---------------------------------------------------------------

test("writeDraft: ключи сортируются (детерминизм)", () => {
  const dir = mkdtempSync(join(tmpdir(), "emo-"));
  const p = join(dir, "draft.json");
  writeDraft({ bbb: "B", aaa: "A", mmm: "M" }, p);
  const keys = Object.keys(JSON.parse(readFileSync(p, "utf-8")) as object);
  assert.deepEqual(keys, ["aaa", "bbb", "mmm"]);
});
