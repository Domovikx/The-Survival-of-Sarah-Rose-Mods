/**
 * voice_names.test.mts — спека схемы имён озвучки как тесты.
 *
 * Проверяем не «код работает», а «схема закрывает потребности»: A/B-голоса, правка
 * перевода, правка тона, отсутствие тона, юникод, разметка Ren'Py, опасные
 * символы, легаси-имена, длину пути, коллизии на РЕАЛЬНОМ корпусе и — отдельно —
 * ПОЛНОТУ набора полей аудио-идентичности (забыть новый вход нельзя: тест красный).
 *
 * Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/voice_names.test.mts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  audioIdentity,
  canonicalIdentity,
  enHash,
  isStale,
  MAX_VARIANT,
  parseVoiceName,
  sanitizeVariant,
  staleReason,
  stateHash,
  ttsText,
  voiceFileName,
} from "./voice_names.mts";

const AUDIO = join("patches", "ai-voice-pack", "audio");
const md5 = (s: string): string => createHash("md5").update(s, "utf8").digest("hex");
const POT = join("patches", "ai-voice-pack", "po", "template.pot");
const EN = "The great castle rests at the heart of the nation of Rosanna.";
const RU = "Величественный замок стоит в самом сердце страны Розанна.";

// ------------------------------------------------------------ формат -----

test("имя собирается и разбирается без потерь (16 + 8)", () => {
  const name = voiceFileName({ en: EN, variant: "Sarah_1", spoken: RU, emotion: "Calm" });
  assert.match(name, /^[0-9a-f]{16}__[0-9a-f]{8}__Sarah_1\.opus$/);
  assert.deepEqual(parseVoiceName(name), {
    en16: enHash(EN),
    state8: stateHash(RU, "Calm"),
    variant: "Sarah_1",
  });
});

test("человекочитаемый голос — в хвосте, два хэша фиксированной длины спереди", () => {
  const name = voiceFileName({ en: EN, variant: "Narrator", spoken: RU });
  assert.ok(name.endsWith("__Narrator.opus"), name);
  assert.match(name, /^[0-9a-f]{16}__[0-9a-f]{8}__Narrator\.opus$/);
});

test("имя состоит только из безопасных символов; хэши — строчный hex", () => {
  const name = voiceFileName({ en: EN, variant: "Sarah", spoken: RU });
  assert.match(name, /^[A-Za-z0-9_.]+$/, "никаких запрещённых символов Windows");
  const parts = parseVoiceName(name)!;
  assert.match(parts.en16, /^[0-9a-f]{16}$/);
  assert.match(parts.state8, /^[0-9a-f]{8}$/);
});

test("длина имени не превышает бюджет MAX_PATH", () => {
  const name = voiceFileName({ en: EN, variant: "Sarah_passion", spoken: RU, emotion: "x" });
  assert.equal(name.length, 16 + 2 + 8 + 2 + "Sarah_passion".length + 5);
  assert.ok(name.length <= 52, `имя ${name.length} символов — слишком длинное`);
});

// ------------------------------------------- канон JSON (основа state8) -----

test("канонический JSON: порядок ключей не влияет на хэш", () => {
  const a = canonicalIdentity(audioIdentity(RU, "Calm"));
  const shuffled = { text: RU, emotion: "Calm" };
  assert.equal(canonicalIdentity(shuffled), a);
  assert.equal(
    a,
    `{"emotion":"Calm","text":${JSON.stringify(RU)}}`,
    "ключи по алфавиту, без пробелов, без \\u-эскейпов",
  );
});

test("набор полей аудио-идентичности ровно такой — новый вход обязан попасть сюда", () => {
  // Страж полноты: если кто-то добавит в звук новый по-репличный параметр и не
  // внесёт его в JSON, файл будет считаться актуальным при другом звуке.
  assert.deepEqual(Object.keys(audioIdentity("x", "y")).toSorted(), ["emotion", "text"]);
});

test("state8 известного примера не меняется молча (золотое значение)", () => {
  // Eula: "You can do that for them, they'll treat you right." / ru / Mocking and detached
  const text = "Ты можешь делать это для них — они к тебе правильно отнесутся.";
  const json = canonicalIdentity(audioIdentity(text, "Mocking and detached"));
  assert.equal(md5(json).slice(0, 8), stateHash(text, "Mocking and detached"));
});

// ------------------------------------------------ очистка текста ----------

test("ttsText: снимает разметку Ren'Py, подстановки и лишние пробелы", () => {
  assert.equal(ttsText("{i}Кто кого сопровождает?{/i}"), "Кто кого сопровождает?");
  assert.equal(ttsText("[unifyarmies] — за то, чтобы объединить армии."), "за то, чтобы объединить армии.");
  assert.equal(ttsText("a   b\n\nc"), "a b c");
  assert.equal(ttsText("  пробелы  "), "пробелы");
  assert.equal(ttsText("слово !"), "слово!");
  // NFC: одинаковый по смыслу текст даёт одинаковую строку
  assert.equal(ttsText("йога"), ttsText("и\u0306ога"));
});

test("косметика (пробелы, теги) не вызывает переозвучку, а текст — вызывает", () => {
  const base = stateHash(RU, "Calm");
  assert.equal(stateHash(`  ${RU}  `, "Calm"), base, "пробелы по краям — не изменение");
  assert.equal(stateHash(`{i}${RU}{/i}`, "Calm"), base, "разметка вырезается до хэша");
  assert.notEqual(stateHash(`${RU}.`, "Calm"), base, "правка текста — изменение");
});

// -------------------------------------------------- наши потребности -----

test("правка перевода меняет имя, реплика (префикс) остаётся", () => {
  const a = voiceFileName({ en: EN, variant: "Sarah", spoken: RU });
  const b = voiceFileName({ en: EN, variant: "Sarah", spoken: `${RU} (уточнили)` });
  assert.equal(parseVoiceName(a)!.en16, parseVoiceName(b)!.en16);
  assert.notEqual(parseVoiceName(a)!.state8, parseVoiceName(b)!.state8);
  assert.equal(staleReason(a, { variant: "Sarah", state8: parseVoiceName(b)!.state8 }), "state");
});

test("правка тона меняет имя при том же тексте", () => {
  const calm = voiceFileName({ en: EN, variant: "Sarah", spoken: RU, emotion: "Calm" });
  const angry = voiceFileName({ en: EN, variant: "Sarah", spoken: RU, emotion: "Angry" });
  const none = voiceFileName({ en: EN, variant: "Sarah", spoken: RU });
  assert.notEqual(parseVoiceName(calm)!.state8, parseVoiceName(angry)!.state8);
  assert.notEqual(parseVoiceName(calm)!.state8, parseVoiceName(none)!.state8);
  assert.equal(parseVoiceName(none)!.state8, stateHash(RU, ""));
  assert.equal(parseVoiceName(none)!.state8, stateHash(RU, null));
});

test("правка английского оригинала = другая реплика (меняется префикс)", () => {
  const a = voiceFileName({ en: EN, variant: "Sarah", spoken: RU });
  const b = voiceFileName({ en: `${EN} `, variant: "Sarah", spoken: RU });
  assert.notEqual(parseVoiceName(a)!.en16, parseVoiceName(b)!.en16);
});

test("A/B-варианты одного голоса: общий префикс и общее состояние", () => {
  const a = voiceFileName({ en: EN, variant: "Sarah", spoken: RU });
  const b = voiceFileName({ en: EN, variant: "Sarah_1", spoken: RU });
  assert.equal(parseVoiceName(a)!.en16, parseVoiceName(b)!.en16);
  assert.equal(parseVoiceName(a)!.state8, parseVoiceName(b)!.state8);
  assert.notEqual(a, b);
});

test("английская озвучка: состояние считается от оригинала", () => {
  const en = voiceFileName({ en: EN, variant: "Narrator", spoken: EN, emotion: "Calm" });
  assert.equal(parseVoiceName(en)!.state8, stateHash(EN, "Calm"));
  const ru = voiceFileName({ en: EN, variant: "Narrator", spoken: RU, emotion: "Calm" });
  assert.equal(parseVoiceName(en)!.en16, parseVoiceName(ru)!.en16);
  assert.notEqual(parseVoiceName(en)!.state8, parseVoiceName(ru)!.state8);
});

test("тексты, различающиеся только регистром или юникодом, дают разные имена", () => {
  const a = voiceFileName({ en: EN, variant: "Sarah", spoken: "Да." });
  const b = voiceFileName({ en: EN, variant: "Sarah", spoken: "да." });
  const c = voiceFileName({ en: EN, variant: "Sarah", spoken: "はい。" });
  assert.notEqual(parseVoiceName(a)!.state8, parseVoiceName(b)!.state8);
  assert.notEqual(parseVoiceName(a)!.state8, parseVoiceName(c)!.state8);
});

// ---------------------------------------------------- граничные случаи -----

test("вариант с одним `_` не ломает разбор (Sarah_1, Sarah_passion)", () => {
  for (const v of ["Sarah_1", "Sarah_passion", "Sarah_1_passion"]) {
    const name = voiceFileName({ en: EN, variant: v, spoken: RU });
    assert.equal(parseVoiceName(name)!.variant, v);
  }
});

test("двойное подчёркивание в варианте схлопывается — иначе разбор неоднозначен", () => {
  const name = voiceFileName({ en: EN, variant: "Sarah__1", spoken: RU });
  assert.equal(parseVoiceName(name)!.variant, "Sarah_1");
});

test("опасные символы Windows вычищаются, хвостовые точки/пробелы тоже", () => {
  assert.equal(sanitizeVariant('Sa:ra/\\*?"<>|h'), "Sarah");
  assert.equal(sanitizeVariant("Sarah..."), "Sarah");
  assert.equal(sanitizeVariant("  Sarah  "), "Sarah");
  assert.equal(sanitizeVariant("..Sarah.."), "Sarah");
});

test("пустые входы — ошибка, а не имя из ничего", () => {
  assert.throws(() => voiceFileName({ en: "", variant: "Sarah", spoken: RU }), /пустой английский/);
  assert.throws(() => voiceFileName({ en: EN, variant: "Sarah", spoken: "   " }), /пустой текст/);
  assert.throws(() => voiceFileName({ en: EN, variant: "***", spoken: RU }), /пустое имя голоса/);
  assert.throws(() => voiceFileName({ en: EN, variant: "S".repeat(MAX_VARIANT + 1), spoken: RU }), /длиннее/);
});

test("строка только из разметки не даёт имени (озвучивать нечего)", () => {
  assert.throws(() => voiceFileName({ en: EN, variant: "Sarah", spoken: "{i}{/i}" }), /пустой текст/);
});

test("легаси-имя не разбирается и считается устаревшим", () => {
  const legacy = `${"a".repeat(32)}__Sarah.opus`;
  assert.equal(parseVoiceName(legacy), null);
  assert.equal(staleReason(legacy, { variant: "Sarah", state8: stateHash(RU) }), "legacy");
  assert.ok(isStale(legacy, { variant: "Sarah", state8: stateHash(RU) }));
});

test("актуальный файл не устарел, а чужой голос — не «устаревший»", () => {
  const name = voiceFileName({ en: EN, variant: "Sarah", spoken: RU, emotion: "Calm" });
  assert.equal(staleReason(name, { variant: "Sarah", state8: stateHash(RU, "Calm") }), null);
  assert.equal(staleReason(name, { variant: "Sarah_1", state8: stateHash(RU, "Calm") }), "variant");
  assert.equal(isStale(name, { variant: "Sarah_1", state8: stateHash(RU, "Calm") }), false);
});

// --------------------------------------------------- коллизии/масштаб -----

test("на 200 000 случайных текстов нет ни одной коллизии", () => {
  const seen = new Set<string>();
  let collisions = 0;
  for (let i = 0; i < 200_000; i++) {
    const name = voiceFileName({ en: `en-${i}`, variant: "Sarah", spoken: `перевод-${i}` });
    if (seen.has(name)) collisions++;
    seen.add(name);
  }
  assert.equal(collisions, 0);
});

test("реальный корпус: миграция не даёт ни одной коллизии внутри арки", () => {
  if (!existsSync(AUDIO)) return;
  // uid (md5 EN) → текст и тон из POT: по ним строим новое имя.
  const byUid = new Map<string, { en: string; emotion: string }>();
  for (const block of readFileSync(POT, "utf-8").split(/\n\n+/)) {
    const msgid = /^msgid "(.*)"$/m.exec(block)?.[1];
    if (!msgid) continue;
    const emotion =
      /^#\. emotion_new: (.+)$/m.exec(block)?.[1]?.trim() ?? /^#\. emotion: (.+)$/m.exec(block)?.[1]?.trim() ?? "";
    byUid.set(md5(msgid), { en: msgid, emotion });
  }

  let checked = 0;
  let unknown = 0;
  const collisions: string[] = [];
  for (const lang of readdirSync(AUDIO)) {
    const langDir = join(AUDIO, lang);
    if (!statSync(langDir).isDirectory()) continue;
    for (const arc of readdirSync(langDir)) {
      const arcDir = join(langDir, arc);
      if (!statSync(arcDir).isDirectory()) continue;
      const names = new Set<string>();
      for (const f of readdirSync(arcDir)) {
        const legacy = /^([0-9a-f]{32})__(.+)\.(?:opus|wav)$/.exec(f);
        // Новая схема: имя уже целевое — проверяем уникальность и считаем.
        if (parseVoiceName(f)) {
          if (names.has(f)) collisions.push(`${lang}/${arc}/${f}`);
          names.add(f);
          checked++;
          continue;
        }
        if (!legacy) continue;
        const [, uid, variant] = legacy;
        const src = byUid.get(uid!);
        if (!src) {
          unknown++;
          continue;
        }
        const name = voiceFileName({ en: src.en, variant: variant!, spoken: src.en, emotion: src.emotion });
        if (names.has(name)) collisions.push(`${lang}/${arc}/${name}`);
        names.add(name);
        checked++;
      }
    }
  }
  assert.ok(checked > 1000, `проверено мало файлов: ${checked}`);
  assert.deepEqual(collisions, [], `коллизии: ${collisions.slice(0, 5).join(", ")}`);
  assert.ok(unknown < checked * 0.05, `файлов без строки в POT: ${unknown} из ${checked}`);
});
