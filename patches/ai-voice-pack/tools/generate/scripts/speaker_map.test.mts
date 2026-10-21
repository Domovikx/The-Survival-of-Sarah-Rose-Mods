/**
 * Тесты speaker_map.mts — мапа «спикер POT → голос (каст)».
 *
 * Юнит: парсер спикеров/uid'ов POT, сводник кастов, все классы ошибок/
 * предупреждений audit (включая двустороннюю сверку VOICES <-> диск),
 * эмиссия блока новых спикеров, подсказки голосов.
 * Живой гард: casts/casts.mts (типизированный модуль) согласован с реальным
 * template.pot и папками casts/ — каждый спикер POT есть в SPEAKERS, каждый
 * каст объявлен и существует.
 * Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/speaker_map.test.mts
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { VOICES, SPEAKERS } from "../../../casts/casts.mts";
import {
  DEFAULT_CASTS,
  DEFAULT_POT,
  audit,
  emitAdditions,
  levenshtein,
  listCasts,
  potSpeakers,
  potUids,
  suggestCast,
  type AuditInput,
  type SpeakerMapSnapshot,
} from "./speaker_map.mts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
/** Фикстуры — только в tmp/ репозитории (правило репы). */
const DIR = join(REPO_ROOT, "tmp", "speaker-map-fixture");

// ----------------------------------------------------------------- POT ------

test("potSpeakers: считает только speaker-контексты, unescape имён", () => {
  const pot = `
#. uid: 00000000000000000000000000000000
msgctxt "speaker:Narrator"
msgid "One"

msgctxt "speaker:Sarah"
msgid "Two"

msgctxt "speaker:Captain \\"The Fox\\""
msgid "Three"

msgctxt "speaker-name"
msgid "Не спикер"

msgctxt "menu"
msgid "Тоже не спикер"
`;
  const s = potSpeakers(pot);
  assert.equal(s.get("Narrator"), 1);
  assert.equal(s.get("Sarah"), 1);
  assert.equal(s.get('Captain "The Fox"'), 1);
  assert.ok(!s.has("speaker-name"));
  assert.ok(!s.has("menu"));
  assert.equal(s.size, 3);
});

test("potSpeakers: один спикер — несколько записей, суммируется", () => {
  const pot = `
msgctxt "speaker:Sarah"
msgid "A"

msgctxt "speaker:Sarah"
msgid "B"
`;
  assert.equal(potSpeakers(pot).get("Sarah"), 2);
});

test("potUids: собирает uid'ы из комментариев", () => {
  const pot = `#. uid: 928b18805931076c6fd6fe86d3d240c4
msgid "a"

#. uid: 000000000000000000000000000000aa
msgid "b"
`;
  const uids = potUids(pot);
  assert.ok(uids.has("928b18805931076c6fd6fe86d3d240c4"));
  assert.ok(uids.has("000000000000000000000000000000aa"));
  assert.equal(uids.size, 2);
});

// --------------------------------------------------------------- casts ------

test("listCasts: только папки с контрактом {Name}.mts", () => {
  rmSync(DIR, { recursive: true, force: true });
  const casts = join(DIR, "casts");
  for (const name of ["Alpha", "Beta"]) {
    mkdirSync(join(casts, name), { recursive: true });
    writeFileSync(join(casts, name, `${name}.mts`), "export const x = 1;\n");
  }
  mkdirSync(join(casts, "БезКонтракта"), { recursive: true });
  writeFileSync(join(casts, "cast_schema.json"), "{}");
  assert.deepEqual(listCasts(casts), ["Alpha", "Beta"]);
  assert.deepEqual(listCasts(join(DIR, "нет")), []);
  rmSync(DIR, { recursive: true, force: true });
});

// --------------------------------------------------------------- audit ------

function fixture(
  speakersObj: Record<string, string | null>,
  castsOnDisk: string[] = ["Alpha", "Beta", "Generic Male Mature"],
  declaredCasts: string[] = castsOnDisk,
  potSpeakersList: [string, number][] = [],
): ReturnType<typeof audit> {
  const map: SpeakerMapSnapshot = { speakers: speakersObj };
  const input: AuditInput = {
    map,
    speakers: new Map<string, number>(potSpeakersList),
    castsOnDisk,
    declaredCasts,
  };
  return audit(input);
}

test("audit: чистая мапа — без ошибок", () => {
  const res = fixture(
    { Alpha: "Alpha", Bob: "Generic Male Mature", Mute: null },
    ["Alpha", "Generic Male Mature"],
    ["Alpha", "Generic Male Mature"],
    [
      ["Alpha", 10],
      ["Bob", 5],
      ["Mute", 1],
    ],
  );
  assert.deepEqual(res.errors, []);
  assert.equal(res.mapped, 3);
  assert.equal(res.voiced, 2);
  assert.equal(res.totalSpeakers, 3);
});

test("audit: спикер без ключа — ERROR и попадает в missing с подсказкой", () => {
  const res = fixture(
    { Alpha: "Alpha" },
    ["Alpha", "Beta"],
    ["Alpha", "Beta"],
    [
      ["Alpha", 10],
      ["Beta", 3],
    ],
  );
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0], /спикер без ключа.*Beta/);
  assert.equal(res.missing.length, 1);
  assert.equal(res.missing[0].speaker, "Beta");
  assert.equal(res.missing[0].suggestion, "Beta"); // casefold-точный кандидат
});

test("audit: null — предупреждение, не ошибка", () => {
  const res = fixture({ Alpha: null }, ["Alpha"], ["Alpha"], [["Alpha", 1]]);
  assert.deepEqual(res.errors, []);
  // два предупреждения: сам null + каст Alpha остался без спикеров
  assert.equal(res.warnings.length, 2);
  assert.match(res.warnings.join("\n"), /без голоса \(null\)/);
  assert.match(res.warnings.join("\n"), /каст без спикеров/);
});

test("audit: значение-призрак — ERROR", () => {
  const res = fixture({ Alpha: "Ghost" }, ["Alpha"], ["Alpha"], [["Alpha", 1]]);
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0], /протухшее значение.*Ghost/);
});

test("audit: ключ вне POT — ERROR (переименование/выпадение)", () => {
  const res = fixture({ Alpha: "Alpha", OldName: "Alpha" }, ["Alpha"], ["Alpha"], [["Alpha", 1]]);
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0], /протухший ключ.*OldName/);
});

test("audit: VOICES <-> диск в обе стороны", () => {
  const res = fixture(
    { Alpha: "Alpha" },
    ["Alpha", "НовыйКаст"], // на диске появился каст
    ["Alpha", "Протухший"], // а в юнионе остался старый
    [["Alpha", 1]],
  );
  assert.match(res.errors.join("\n"), /не объявлен в VOICES: "НовыйКаст"/);
  assert.match(res.errors.join("\n"), /VOICES без папки на диске: "Протухший"/);
});

test("audit: каст без спикеров — предупреждение", () => {
  const res = fixture({ Alpha: "Alpha" }, ["Alpha", "Lonely"], ["Alpha", "Lonely"], [["Alpha", 1]]);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.unusedCasts, ["Lonely"]);
  assert.match(res.warnings[0], /каст без спикеров.*Lonely/);
});

test("audit: шаринг голоса — castUsage собирает спикеров", () => {
  const res = fixture(
    { Alpha: "Generic Male Mature", Bob: "Generic Male Mature" },
    ["Generic Male Mature"],
    ["Generic Male Mature"],
    [
      ["Alpha", 1],
      ["Bob", 1],
    ],
  );
  assert.deepEqual(res.castUsage.get("Generic Male Mature"), ["Alpha", "Bob"]);
});

// ------------------------------------------------------- suggestions/emit ---

test("suggestCast: casefold-точное, затем Левенштейн <= 2", () => {
  const casts = ["Narrator", "Generic Female Young"];
  assert.equal(suggestCast("narrator", casts), "Narrator");
  assert.equal(suggestCast("Narrater", casts), "Narrator"); // опечатка, d=1
  assert.equal(suggestCast("Совсем Другое", casts), null);
});

test("levenshtein: базовые случаи", () => {
  assert.equal(levenshtein("", ""), 0);
  assert.equal(levenshtein("abc", "abc"), 0);
  assert.equal(levenshtein("abc", "abd"), 1);
  assert.equal(levenshtein("kitten", "sitting"), 3);
});

test("emitAdditions: TS-блок с подсказками, сортировка по имени", () => {
  const block = emitAdditions([
    { speaker: "Barkeep", lines: 1, suggestion: "Generic Male Mature" },
    { speaker: "Совсем Новый", lines: 5, suggestion: null },
  ]);
  assert.match(block, /^ {2}"Barkeep": null, \/\/ голос\?: "Generic Male Mature"$/m);
  assert.match(block, /^ {2}"Совсем Новый": null,$/m);
  assert.ok(block.indexOf("Barkeep") < block.indexOf("Совсем")); // сортировка
});

// ------------------------------------------------ живые гарды (реальные файлы) --

test("живой: VOICES совпадает с папками casts/", () => {
  const onDisk = listCasts(DEFAULT_CASTS);
  assert.deepEqual(
    Object.keys(VOICES).sort((a, b) => a.localeCompare(b)),
    onDisk,
    "юнион VOICES и папки casts/ разошлись — поправь casts/voices.mts",
  );
});

test("живой: SPEAKERS согласован с POT и casts/", () => {
  const potText = readFileSync(DEFAULT_POT, "utf8");
  assert.ok(potText.length > 0, "template.pot пуст");
  const res = audit({
    map: { speakers: SPEAKERS },
    speakers: potSpeakers(potText),
    castsOnDisk: listCasts(DEFAULT_CASTS),
    declaredCasts: Object.keys(VOICES),
  });
  assert.deepEqual(
    res.errors,
    [],
    `мапа рассинхронизирована:\n${res.errors.join("\n")}\n` +
      `(запусти: npm run speakers:audit:emit — блок новых спикеров для вставки)`,
  );
  assert.equal(res.mapped, res.totalSpeakers, "не все спикеры POT покрыты ключами SPEAKERS");
});

test("живой: мапа не теряет голоса — есть хотя бы один назначенный каст", () => {
  // значения SPEAKERS — подмножество VOICES + null: тип предиката обязан
  // быть вхождением в тип параметра (иначе TS2677)
  type SpeakerCast = Exclude<(typeof SPEAKERS)[keyof typeof SPEAKERS], null>;
  const values = new Set(Object.values(SPEAKERS).filter((v): v is SpeakerCast => typeof v === "string"));
  assert.ok(values.size > 0, "в SPEAKERS нет ни одного назначенного голоса");
  for (const v of values) assert.ok(Object.keys(VOICES).includes(v), `нет каста: ${v}`);
});
