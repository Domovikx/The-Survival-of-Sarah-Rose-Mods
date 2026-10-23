/**
 * voice_batch.test.mts — тесты TS-оркестратора батч-генерации.
 *
 * Без модели и без python: только selectPhrases/parseCli/resolveRef на
 * РЕАЛЬНЫХ данных репы (POT+ru.po + casts.mts + рефы на диске).
 * Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/voice_batch.test.mts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadCatalog,
  parseCli,
  runawayDuration,
  refActive,
  resolveRef,
  selectPhrases,
  voiceForSpeaker,
} from "./voice_batch.mts";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));

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

  it("сумма выборки ru = dialogue + narration (категории POT-каталога)", () => {
    // 68 357 = 25 121 dialogue + 43 236 narration при текущих рефах (2026-10-22, POT)
    const phrases = selectPhrases(entries, baseArgs);
    const dialogue = phrases.filter((p) => p.category === "dialogue").length;
    const narration = phrases.filter((p) => p.category === "narration").length;
    assert.equal(phrases.length, 68_357, `всего ru: ${phrases.length}`);
    assert.equal(dialogue, 25_121, `dialogue: ${dialogue}`);
    assert.equal(narration, 43_236, `narration: ${narration}`);
  });

  it("у каждой фразы есть текст своего языка и эмоция из POT-метаданных", () => {
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

describe("детектор runaway-длительности (мусорные вбросы, бага 2026-10-23)", () => {
  const byUid = (uid: string): string => entries.find((e) => e.uid === uid)!.new;
  it("кейсы реального прогона 2026-10-23: Kate 119.88s и Marion 42s — бегущие", () => {
    assert.equal(runawayDuration(byUid("d51f45b910ed0371faacd4b30ecab384"), 119.88), true, "Kate");
    assert.equal(runawayDuration(byUid("c135569dc4d2c77eef343ec2a50acc6f"), 42), true, "Marion");
  });
  it("нормальные файлы того же прогона не триггерят", () => {
    assert.equal(runawayDuration(byUid("965008809955fb24bad05d00315049d9"), 5.0), false, "Carolyn");
    assert.equal(runawayDuration(byUid("9aad46fc3b7ce586f8c07e89392511b9"), 1.96), false, "Nathan");
  });
  it("ложные срабатывания: короткий крик и самая длинная наррация по темпу", () => {
    assert.equal(runawayDuration("АААААА!!", 15), false, "крик 15с (< 30с — не флагаем)");
    assert.equal(runawayDuration("Да.", 4), false, "короткая реплика");
    const long = entries
      .filter((e) => e.category === "narration")
      .reduce((a, b) => (a.new.length > b.new.length ? a : b)).new;
    assert.ok(long.length > 200, `самая длинная наррация подозрительно мала: ${long.length}`);
    assert.equal(runawayDuration(long, 40), false, "длинная, но по темпу");
    assert.equal(runawayDuration(long, (long.length / 11) * 4 + 50), true, "длинная И бегущая");
  });
});

describe("контракт кодировки UTF-8 (мохибака-бага 2026-10-23)", () => {
  const src = (rel: string): string => readFileSync(join(SCRIPTS_DIR, rel), "utf8");
  it("cosyworker.py: sys.stdin.reconfigure в UTF-8 — иначе JSON читается в cp1251", () => {
    assert.match(src("cosyworker.py"), /sys\.stdin\.reconfigure\(encoding=['"]utf-8/);
  });
  it("voicekit/worker.mts: ретрай первой строки на TextEncodeInput (гонка фронтенда)", () => {
    const worker = src(join("voicekit", "worker.mts"));
    assert.match(worker, /TextEncodeInput/);
    assert.match(worker, /повтор через/);
  });
  it("voicekit/worker.mts: spawn шима с PYTHONIOENCODING=utf-8 (страховка)", () => {
    assert.match(src(join("voicekit", "worker.mts")), /PYTHONIOENCODING:\s*"utf-8"/);
  });
  it("voice_queue.sh: export PYTHONIOENCODING=utf-8 не убран", () => {
    assert.match(src("voice_queue.sh"), /export PYTHONIOENCODING=utf-8/);
  });
});

describe("формат корпуса OpusHead 24000 (расхождение 2026-10-23)", () => {
  const audio = readFileSync(join(SCRIPTS_DIR, "voicekit", "audio.mts"), "utf8");
  it("tensorToOpus: явный выходной -ar — loudnorm ресемплит до 192k, libopus без -ar сам берёт 48000", () => {
    // Regex терпел и prettier-формат «по элементу на строку» (2026-10-23).
    assert.match(
      audio,
      /"-c:a",\s*"libopus",\s*"-b:a",\s*"24k",\s*"-ac",\s*"1",\s*"-ar",\s*String\(sr\),\s*"-f",\s*"opus"/,
    );
  });
  it("healWavToOpus: без -af — wav уже 24k, фильтр снова увёл бы формат в 48000", () => {
    const line = readFileSync(join(SCRIPTS_DIR, "voice_batch.mts"), "utf8")
      .split("\n")
      .find((l) => l.includes("libopus"));
    assert.ok(line, "строка libopus в voice_batch.mts");
    assert.ok(!line.includes("-af"), `heal-конверт должен быть без -af: ${line}`);
  });
});

describe("миграция python → TS (кодирование переехало)", () => {
  const src = (rel: string): string => readFileSync(join(SCRIPTS_DIR, rel), "utf8");
  it("cosyworker.py: чистый инференс-шим v2 — pcm_b64, без аудио-цепочки", () => {
    const py = src("cosyworker.py");
    assert.match(py, /pcm_b64/);
    assert.ok(!py.includes("import subprocess"), "шим не должен кодировать — ffmpeg на TS (voicekit/audio.mts)");
    assert.ok(
      !py.includes("tensor_to_opus") && !py.includes("wav_to_opus") && !py.includes("save_wav_chain"),
      "аудио-цепочка переехала в voicekit/audio.mts",
    );
    assert.ok(!py.includes("trim_tail_burst"), "trim переехал в voicekit/trim.mts");
    assert.ok(!py.includes("torchaudio"), "wav-цепочка переехала в voicekit/audio.mts");
  });
  it("voicekit/audio.mts: LOUD_ARGS и труба f32le на месте", () => {
    const audio = src(join("voicekit", "audio.mts"));
    assert.match(audio, /loudnorm=I=/);
    assert.match(audio, /"-f",\s*"f32le"/);
  });
});
