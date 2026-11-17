/**
 * voice_names.test.mts — спека схемы имён озвучки как тесты.
 *
 * Проверяем не «код работает», а «схема закрывает потребности»: A/B-голоса, правка
 * перевода, правка тона, отсутствие тона, юникод, разметка Ren'Py, опасные
 * символы, легаси-имена, длину пути, коллизии на РЕАЛЬНОМ корпусе, — и отдельно:
 *   - ПОЛНОТУ набора полей аудио-идентичности (забыть новый вход нельзя);
 *   - ПАРИТЕТ с Python (`base64.b32encode`): имя, посчитанное рантаймом Ren'Py,
 *     обязано совпадать с именем, посчитанным сборкой (иначе игра молчит).
 *
 * Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/voice_names.test.mts
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { parsePo } from "../../../../../.opencode/skills/renpy-po/po_core.mts";
import {
  audioIdentity,
  canonicalIdentity,
  enHash,
  hexEnHash,
  isStale,
  MAX_VARIANT,
  NAME_SEP,
  parseAnyVoiceName,
  parseVoiceName,
  sanitizeVariant,
  staleReason,
  stateHash,
  ttsText,
  VARIANT_SEP,
  voiceFileName,
} from "./voice_names.mts";

const AUDIO = join("patches", "ai-voice-pack", "audio");
const POT = join("patches", "ai-voice-pack", "po", "template.pot");
const md5 = (s: string): string => createHash("md5").update(s, "utf8").digest("hex");
const md5buf = (s: string): Buffer => createHash("md5").update(s, "utf8").digest();
const EN = "The great castle rests at the heart of the nation of Rosanna.";
const RU = "Величественный замок стоит в самом сердце страны Розанна.";

// ------------------------------------------------------------ формат -----

test("имя собирается и разбирается без потерь (12 + 6, базы32, пробел перед голосом)", () => {
  const name = voiceFileName({ en: EN, variant: "Sarah_1", spoken: RU, emotion: "Calm" });
  assert.match(name, /^[A-Z2-7]{12}-[A-Z2-7]{6} Sarah_1\.opus$/);
  assert.equal(name, "VQY2ASCZUX6U-GBPG4F Sarah_1.opus");
  assert.deepEqual(parseVoiceName(name), {
    scheme: "base32",
    en: enHash(EN),
    state: stateHash(RU, "Calm"),
    variant: "Sarah_1",
  });
});

test("золотые значения: en12 и state6 не меняются молча", () => {
  // Если этот тест покраснел — поменялся либо md5/алфавит, либо состав state.
  // Массовая переозвучка тогда неизбежна (имена = контракт рантайма).
  assert.equal(enHash("Perceptive as always, daughter."), "BQGOZ2CQSZKM");
  assert.equal(enHash(EN), "VQY2ASCZUX6U");
  assert.equal(stateHash(RU), "FCJ4HR");
  assert.equal(stateHash(RU, "Calm"), "GBPG4F");
});

test("человекочитаемый голос — в хвосте, два хэша фиксированной длины спереди", () => {
  const name = voiceFileName({ en: EN, variant: "Narrator", spoken: RU });
  assert.ok(name.endsWith(`${VARIANT_SEP}Narrator.opus`), name);
  assert.match(name, /^[A-Z2-7]{12}-[A-Z2-7]{6} Narrator\.opus$/);
});

test("имя состоит только из безопасных символов; хэши — ВЕРХНИЙ base32", () => {
  const name = voiceFileName({ en: EN, variant: "Sarah", spoken: RU });
  assert.match(name, /^[A-Za-z0-9_.\- ]+$/, "никаких запрещённых символов Windows");
  const parts = parseVoiceName(name)!;
  assert.match(parts.en, /^[A-Z2-7]{12}$/);
  assert.match(parts.state!, /^[A-Z2-7]{6}$/);
  // Регистр в base32 безопасен только пока он единый: Windows/macOS регистронезависимы.
  assert.equal(parts.en, parts.en.toUpperCase());
});

test("разделители в имени: `-` между хэшами, пробел перед голосом", () => {
  const name = voiceFileName({ en: EN, variant: "Sarah", spoken: RU });
  assert.equal(name.indexOf(NAME_SEP), 12);
  assert.equal(name[12 + 1 + 6], VARIANT_SEP);
});

test("длина имени не превышает бюджет MAX_PATH", () => {
  const name = voiceFileName({ en: EN, variant: "Sarah_passion", spoken: RU, emotion: "x" });
  assert.equal(name.length, 12 + 1 + 6 + 1 + "Sarah_passion".length + 5);
  assert.ok(name.length <= 48, `имя ${name.length} символов — слишком длинное`);
  // Худший случай: вариант на пределе MAX_VARIANT.
  const worst = voiceFileName({ en: EN, variant: "V".repeat(MAX_VARIANT), spoken: RU });
  assert.equal(worst.length, 12 + 1 + 6 + 1 + MAX_VARIANT + 5);
  assert.ok(worst.length <= 65, `худшее имя ${worst.length} символов`);
});

// ---------------------------------------------------- паритет с Python -----

/**
 * Посчитать имя рантаймом-аналогом: Python + base64.b32encode.
 * Ввод — base64 от UTF-8 JSON, а не текст в stdin: на Windows python читает
 * stdin в кодировке консоли и юникод приезжает искажённым (поймано на «DAD!»:
 * en12 сходился, а state6 — нет, потому что текст в JSON был уже другим).
 */
const viaPython = (text: string): string | null => {
  const code = [
    "import base64, hashlib, json, sys",
    "payload = json.loads(base64.b64decode(sys.stdin.read().strip()).decode('utf-8'))",
    "en = payload['en']",
    "key = json.dumps({'emotion': payload['emotion'], 'text': payload['text']},",
    "                  sort_keys=True, separators=(',', ':'), ensure_ascii=False)",
    "en12 = base64.b32encode(hashlib.md5(en.encode('utf-8')).digest()[:8]).decode()[:12]",
    "state6 = base64.b32encode(hashlib.md5(key.encode('utf-8')).digest()[:4]).decode()[:6]",
    "print(en12 + '-' + state6)",
  ].join("\n");
  const r = spawnSync("python", ["-c", code], {
    input: Buffer.from(JSON.stringify({ en: text, emotion: "Calm", text: RU }), "utf-8").toString("base64"),
    encoding: "utf-8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (r.status !== 0) return null; // python нет — тест честно скипается
  return r.stdout.trim();
};

test("паритет Python ↔ Node: те же en12 и state6 (иначе игра не найдёт файл)", (t) => {
  const py = viaPython(EN);
  if (py === null) {
    t.skip("python недоступен");
    return;
  }
  const node = `${enHash(EN)}${NAME_SEP}${stateHash(RU, "Calm")}`;
  assert.equal(py, node, "алгоритм base32/md5/JSON разошёлся между Node и Python");
});

test("паритет Python ↔ Node на юникоде и короткой строке", (t) => {
  for (const text of ["DAD!", "はい。", "Ого — 5 «кавычек» и тире!", "{i}разметка{/i}"]) {
    const py = viaPython(text);
    if (py === null) {
      t.skip("python недоступен");
      return;
    }
    assert.equal(py, `${enHash(text)}${NAME_SEP}${stateHash(RU, "Calm")}`, `разошлось на «${text}»`);
  }
});

test("контракт сборка→рантайм: имя удовлетворяет правилам поиска voice_config.rpy", () => {
  // Рантайм ищет файл по списку папки: `startswith(en12 + "-")` + `endswith(" " + variant + "." + ext)`.
  // Проверяем, что имя, собранное сборкой, этим правилам удовлетворяет — включая
  // вариант с пробелами (худший случай) и A/B-суффикс.
  const cases: Array<[string, string]> = [
    ["Sarah", RU],
    ["Sarah_1", RU],
    ["King Orwell Rose", RU],
    ["Generic Male Mature", RU],
  ];
  for (const [variant, spoken] of cases) {
    const name = voiceFileName({ en: EN, variant, spoken, emotion: "Calm" });
    const uid = enHash(EN);
    const ext = name.slice(name.lastIndexOf(".") + 1);
    assert.ok(name.startsWith(`${uid}-`), `рантайм не найдёт по префиксу: ${name}`);
    assert.ok(name.endsWith(` ${variant}.${ext}`), `точная ветка не совпадёт по хвосту: ${name}`);
    // И чужой вариант не должен попадать в точную ветку.
    const other = voiceFileName({ en: EN, variant: "Sarah_X", spoken, emotion: "Calm" });
    assert.ok(!other.endsWith(` ${variant}.${ext}`), "точная ветка не должна ловить чужой вариант");
  }
});

// ------------------------------------------- канон JSON (основа state6) ----

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

test("state6 = base32(md5(канонического JSON)[:4])[:6] — первые 30 бит", () => {
  const text = "Ты можешь делать это для них — они к тебе правильно отнесутся.";
  const json = canonicalIdentity(audioIdentity(text, "Mocking and detached"));
  const expected = ((): string => {
    const buf = md5buf(json).subarray(0, 4);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let out = "";
    let acc = 0;
    let bits = 0;
    for (const byte of buf) {
      acc = (acc << 8) | byte;
      bits += 8;
      while (bits >= 5 && out.length < 6) {
        out += alphabet[(acc >> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    return out;
  })();
  assert.equal(stateHash(text, "Mocking and detached"), expected);
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
  assert.equal(parseVoiceName(a)!.en, parseVoiceName(b)!.en);
  assert.notEqual(parseVoiceName(a)!.state, parseVoiceName(b)!.state);
  assert.equal(staleReason(a, { variant: "Sarah", state: parseVoiceName(b)!.state! }), "state");
});

test("правка тона меняет имя при том же тексте", () => {
  const calm = voiceFileName({ en: EN, variant: "Sarah", spoken: RU, emotion: "Calm" });
  const angry = voiceFileName({ en: EN, variant: "Sarah", spoken: RU, emotion: "Angry" });
  const none = voiceFileName({ en: EN, variant: "Sarah", spoken: RU });
  assert.notEqual(parseVoiceName(calm)!.state, parseVoiceName(angry)!.state);
  assert.notEqual(parseVoiceName(calm)!.state, parseVoiceName(none)!.state);
  assert.equal(parseVoiceName(none)!.state, stateHash(RU, ""));
  assert.equal(parseVoiceName(none)!.state, stateHash(RU, null));
});

test("правка английского оригинала = другая реплика (меняется префикс)", () => {
  const a = voiceFileName({ en: EN, variant: "Sarah", spoken: RU });
  const b = voiceFileName({ en: `${EN} `, variant: "Sarah", spoken: RU });
  assert.notEqual(parseVoiceName(a)!.en, parseVoiceName(b)!.en);
});

test("A/B-варианты одного голоса: общий префикс и общее состояние", () => {
  const a = voiceFileName({ en: EN, variant: "Sarah", spoken: RU });
  const b = voiceFileName({ en: EN, variant: "Sarah_1", spoken: RU });
  assert.equal(parseVoiceName(a)!.en, parseVoiceName(b)!.en);
  assert.equal(parseVoiceName(a)!.state, parseVoiceName(b)!.state);
  assert.notEqual(a, b);
});

test("английская озвучка: состояние считается от оригинала", () => {
  const en = voiceFileName({ en: EN, variant: "Narrator", spoken: EN, emotion: "Calm" });
  assert.equal(parseVoiceName(en)!.state, stateHash(EN, "Calm"));
  const ru = voiceFileName({ en: EN, variant: "Narrator", spoken: RU, emotion: "Calm" });
  assert.equal(parseVoiceName(en)!.en, parseVoiceName(ru)!.en);
  assert.notEqual(parseVoiceName(en)!.state, parseVoiceName(ru)!.state);
});

test("тексты, различающиеся только регистром или юникодом, дают разные имена", () => {
  const a = voiceFileName({ en: EN, variant: "Sarah", spoken: "Да." });
  const b = voiceFileName({ en: EN, variant: "Sarah", spoken: "да." });
  const c = voiceFileName({ en: EN, variant: "Sarah", spoken: "はい。" });
  assert.notEqual(parseVoiceName(a)!.state, parseVoiceName(b)!.state);
  assert.notEqual(parseVoiceName(a)!.state, parseVoiceName(c)!.state);
});

// ---------------------------------------------------- граничные случаи -----

test("вариант с `_`, пробелами и дефисами разбирается однозначно", () => {
  for (const v of ["Sarah_1", "Sarah_1_passion", "King Orwell Rose", "Sarah-1", "Sarah - 1"]) {
    const name = voiceFileName({ en: EN, variant: v, spoken: RU });
    assert.equal(parseVoiceName(name)!.variant, v, name);
  }
});

test("опасные символы Windows вычищаются, хвостовые точки/пробелы тоже", () => {
  assert.equal(sanitizeVariant('Sa:ra/\\*?"<>|h'), "Sarah");
  assert.equal(sanitizeVariant("Sarah..."), "Sarah");
  assert.equal(sanitizeVariant("  Sarah  "), "Sarah");
  assert.equal(sanitizeVariant("..Sarah.."), "Sarah");
  assert.equal(sanitizeVariant("King  Orwell   Rose"), "King Orwell Rose", "двойные пробелы схлопнуты");
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

test("легаси-имя не разбирается новой схемой и считается устаревшим", () => {
  const legacy = `${"a".repeat(32)}__Sarah.opus`;
  assert.equal(parseVoiceName(legacy), null);
  assert.deepEqual(parseAnyVoiceName(legacy), { scheme: "uid32", en: "a".repeat(32), state: null, variant: "Sarah" });
  assert.equal(staleReason(legacy, { variant: "Sarah", state: stateHash(RU) }), "legacy");
  assert.ok(isStale(legacy, { variant: "Sarah", state: stateHash(RU) }));
});

test("имя предыдущей (hex) схемы разбирается как `hex`, но новой схемой не считается", () => {
  const hex = `${hexEnHash(EN)}__${md5(RU).slice(0, 8)}__Sarah.opus`;
  assert.equal(parseVoiceName(hex), null, "hex-имя не должно считаться актуальным");
  assert.deepEqual(parseAnyVoiceName(hex), {
    scheme: "hex",
    en: hexEnHash(EN),
    state: md5(RU).slice(0, 8),
    variant: "Sarah",
  });
});

test("чужой файл (не имя озвучки) не разбирается вовсе", () => {
  for (const junk of ["README.txt", "Sarah.opus", "deadbeef.opus", "BQGOZ2CQSZKM-Sarah.opus"]) {
    assert.equal(parseAnyVoiceName(junk), null, junk);
  }
});

test("актуальный файл не устарел, а чужой голос — не «устаревший»", () => {
  const name = voiceFileName({ en: EN, variant: "Sarah", spoken: RU, emotion: "Calm" });
  assert.equal(staleReason(name, { variant: "Sarah", state: stateHash(RU, "Calm") }), null);
  assert.equal(staleReason(name, { variant: "Sarah_1", state: stateHash(RU, "Calm") }), "variant");
  assert.equal(isStale(name, { variant: "Sarah_1", state: stateHash(RU, "Calm") }), false);
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
  // Префикс (en12 и en16) → оригинал и тон из POT: по ним строим новое имя.
  const byEn = new Map<string, { en: string; emotion: string }>();
  for (const e of parsePo(readFileSync(POT, "utf-8").replace(/\r\n/g, "\n"))) {
    if (!e.msgid) continue;
    const emotion = (
      e.comments.find((c) => c.startsWith("emotion_new:")) ??
      e.comments.find((c) => c.startsWith("emotion:")) ??
      ""
    )
      .replace(/^emotion(_new)?:\s*/, "")
      .trim();
    const src = { en: e.msgid, emotion };
    byEn.set(enHash(e.msgid), src);
    byEn.set(hexEnHash(e.msgid), src);
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
        const parsed = parseAnyVoiceName(f);
        if (!parsed) continue;
        // Новая схема: имя уже целевое — проверяем уникальность и считаем.
        if (parsed.scheme === "base32") {
          if (names.has(f)) collisions.push(`${lang}/${arc}/${f}`);
          names.add(f);
          checked++;
          continue;
        }
        const src = byEn.get(parsed.en);
        if (!src) {
          unknown++;
          continue;
        }
        const name = voiceFileName({ en: src.en, variant: parsed.variant, spoken: src.en, emotion: src.emotion });
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

void md5buf;
