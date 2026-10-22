/**
 * voice_batch.test.mts — тесты TS-оркестратора батч-генерации.
 *
 * Без модели и без python: только selectPhrases/parseCli/resolveRef на
 * РЕАЛЬНЫХ данных репы (каталог voices.jsonl + casts.mts + рефы на диске).
 * Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/voice_batch.test.mts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, it } from "node:test";

import { loadCatalog, parseCli, refActive, resolveRef, selectPhrases, voiceForSpeaker } from "./voice_batch.mts";

const entries = loadCatalog();
const baseArgs = parseCli([]);

describe("каталог и резолв спикеров (SPEAKERS из casts.mts)", () => {
  it("каталог читается: 68k+ записей, header пропущен", () => {
    assert.ok(entries.length > 68_000, `мало записей: ${entries.length}`);
    assert.ok(
      entries.every((e) => /^[0-9a-f]{32}$/.test(e.uid)),
      "uid — 32-hex",
    );
  });

  it("ПОЛНОЕ покрытие SPEAKERS: ни одной dialogue-записи без голоса-ключа", () => {
    const missing = new Set<string>();
    for (const e of entries) {
      if (e.category !== "dialogue") continue;
      const name = e.who_name || "Narrator";
      const speakers = voiceForSpeaker(e);
      // voiceForSpeaker вернёт null только для отсутствующего ключа SPEAKERS
      if (speakers === null) missing.add(name);
    }
    assert.equal(missing.size, 0, `спикеры без SPEAKERS-ключа: ${[...missing].join(", ")}`);
  });

  it("нarration всегда резолвится в Narrator", () => {
    const narr = entries.find((e) => e.category === "narration");
    assert.ok(narr);
    assert.equal(voiceForSpeaker(narr!), "Narrator");
  });

  it("сумма выборки ru = dialogue(озвученных) + narration(озвученных)", () => {
    // 67 352 = 22 328 dialogue + 45 024 narration при текущих рефах (2026-10-22)
    const phrases = selectPhrases(entries, baseArgs);
    const dialogue = phrases.filter((p) => p.uid && entries.find((e) => e.uid === p.uid && e.category === "dialogue"));
    const narration = phrases.length - dialogue.length;
    assert.equal(phrases.length, 67_352, `всего ru: ${phrases.length}`);
    assert.equal(dialogue.length, 22_328, `dialogue: ${dialogue.length}`);
    assert.equal(narration, 45_024, `narration: ${narration}`);
  });

  it("у каждой фразы есть текст своего языка и эмоция из emotions.json", () => {
    const phrases = selectPhrases(entries, baseArgs);
    const withEmo = phrases.filter((p) => p.emotion);
    assert.ok(withEmo.length / phrases.length > 0.99, "эмоции покрывают >99% фраз");
    const sample = phrases[1000];
    assert.ok(sample.text.length > 0, "text не пуст");
    assert.equal(sample.lang, "ru");
  });

  it("--lang en берёт старый английский текст, uid те же", () => {
    const ru = selectPhrases(entries, baseArgs).slice(0, 50);
    const en = selectPhrases(entries, { ...baseArgs, lang: "en" }).slice(0, 50);
    assert.deepEqual(
      ru.map((p) => p.uid),
      en.map((p) => p.uid),
    );
    assert.equal(en[0].text, en[0].textOld);
  });
});

describe("фильтры selectPhrases", () => {
  it("--arc: только эта арка", () => {
    const phrases = selectPhrases(entries, { ...baseArgs, arc: "Prologue" });
    assert.ok(phrases.length > 0);
    assert.ok(phrases.every((p) => p.arc === "Prologue"));
  });

  it("--char: только этот спикер (по who_name)", () => {
    const phrases = selectPhrases(entries, { ...baseArgs, char: "Sarah" });
    assert.ok(phrases.length > 0);
    assert.ok(phrases.every((p) => p.voice === "Sarah"));
  });

  it("--uid: только эти uid", () => {
    const target = entries.find((e) => e.category === "dialogue" && e.who_name === "Sarah")!;
    const phrases = selectPhrases(entries, { ...baseArgs, uid: [target.uid] });
    assert.equal(phrases.length, 1);
    assert.equal(phrases[0].uid, target.uid);
  });

  it("--no-emotion: суффикс _plain и эмоция сброшена", () => {
    const phrases = selectPhrases(entries, { ...baseArgs, arc: "Prologue", noEmotion: true });
    assert.ok(phrases.every((p) => p.variant.endsWith("_plain")));
    assert.ok(phrases.every((p) => p.emotion === null));
  });

  it("--emotion sad: пресет раскрыт, суффикс _em во всех вариантах", () => {
    const sad = parseCli(["--emotion", "sad"]).emotion;
    assert.match(sad ?? "", /Sadly/);
    const phrases = selectPhrases(entries, { ...baseArgs, arc: "Prologue", emotion: sad });
    assert.ok(phrases.every((p) => p.variant.endsWith("_em")));
  });

  it("неозвученный голос пропускается (нет активного рефа)", () => {
    const nullVoice = entries.find((e) => e.category === "dialogue" && voiceForSpeaker(e) === null);
    if (!nullVoice) return; // все спикеры покрыты — пропуск
    const phrases = selectPhrases(entries, { ...baseArgs, uid: [nullVoice.uid] });
    assert.equal(phrases.length, 0);
  });
});

describe("demo-режим --text", () => {
  it("uid = md5(text), arc = Demo, out под voices-суффиксом", () => {
    const text = "Тестовая фраза для демо-режима.";
    const uid = createHash("md5").update(text, "utf8").digest("hex");
    const phrases = selectPhrases(entries, { ...baseArgs, text, char: "Sarah" });
    assert.equal(phrases.length, 1);
    assert.equal(phrases[0].uid, uid);
    assert.equal(phrases[0].arc, "Demo");
    assert.ok(phrases[0].out.includes(`${uid}__Sarah.wav`));
  });

  it("без рефа (--char неозвучен и --ref нет) — пусто", () => {
    const phrases = selectPhrases(entries, { ...baseArgs, text: "x", char: "НетТакогоГолоса" });
    assert.equal(phrases.length, 0);
  });
});

describe("resolveRef / refActive", () => {
  it("легаси-префиксы редиректятся в casts/voices/", () => {
    const legacy = resolveRef("voice_candidates/Sarah/Sarah.wav");
    assert.ok(legacy.includes(join("casts", "voices", "Sarah")), legacy);
    const registry = resolveRef("registry/casts/Mary/Mary.wav");
    assert.ok(registry.includes(join("casts", "voices", "Mary")), registry);
    const bare = resolveRef("casts/Mary/Mary.wav"); // до-voices-формат
    assert.ok(bare.includes(join("casts", "voices", "Mary")), bare);
  });

  it("refActive: активный реф существует, мусорное имя — null", () => {
    assert.ok(refActive("Sarah")?.endsWith("Sarah.wav"));
    assert.equal(refActive("НетТакогоГолоса"), null);
  });
});

describe("parseCli", () => {
  it("дефолты: lang=ru, device=cuda, seed=42, тег эмоции em", () => {
    const a = parseCli([]);
    assert.equal(a.lang, "ru");
    assert.equal(a.device, "cuda");
    assert.equal(a.seed, 42);
    assert.equal(a.emotionTag, "em");
    assert.equal(a.force, false);
  });

  it("пресеты эмоций раскрываются, свободная строка проходит как есть", () => {
    assert.match(parseCli(["--emotion", "whisper"]).emotion ?? "", /whisper/i);
    const free = "In a burst of passion";
    assert.equal(parseCli(["--emotion", free]).emotion, free);
  });

  it("--limit/--seed парсятся в числа", () => {
    const a = parseCli(["--limit", "5", "--seed", "7"]);
    assert.equal(a.limit, 5);
    assert.equal(a.seed, 7);
  });
});
