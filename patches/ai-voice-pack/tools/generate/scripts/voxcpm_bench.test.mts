// voxcpm_bench.test.mts — тесты чистых функций стенда перебора конфигов VoxCPM2.
// Запуск: node --test patches/ai-voice-pack/tools/generate/scripts/voxcpm_bench.test.mts
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { type Phrase } from "./voice_batch.mts";
import { writeWav16 } from "./voicekit/audio.mts";
import {
  buildMatrix,
  buildPlan,
  DEFAULT_CFG,
  DEFAULT_TIMESTEPS,
  filterByUids,
  filterByArc,
  filterByVoices,
  knobsText,
  matrixName,
  measureLoudness,
  optTag,
  parseBenchCli,
  parseOpt,
  runOpts,
  TRAIN_UID,
  VOX_KNOBS,
} from "./voxcpm_bench.mts";

const HAS_FFMPEG = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

/** Минимальная Phrase для тестов плана (поля — по типу из voice_batch). */
function fakePhrase(uid: string, arc: string, voice: string): Phrase {
  return {
    uid,
    arc,
    category: "narration",
    voice,
    ref: `C:/casts/${voice}/${voice}.wav`,
    out: `C:/repo/audio/vo_ru/${arc}/${uid}__VoxCPM2.wav`,
    variant: "VoxCPM2",
    lang: "ru",
    text: `фраза ${uid}`,
    textOld: `phrase ${uid}`,
    textNew: `фраза ${uid}`,
    emotion: "Wistful nostalgia",
    emotionRu: null,
  };
}

test("buildMatrix: полный разворот — 4 cfg × 3 ts + две одиночные точки", () => {
  const m = buildMatrix();
  assert.equal(m.length, 14);
  const grid = m.filter((r) => r.suffix === "");
  assert.equal(grid.length, 12);
  assert.deepEqual([...new Set(grid.map((r) => r.cfg))], [1.5, 2.0, 2.5, 3.0]);
  assert.deepEqual([...new Set(grid.map((r) => r.ts))], [10, 20, 30]);
  const retryOff = m.find((r) => r.suffix === "_retryOff");
  assert.ok(retryOff, "точка retryOff обязана быть");
  assert.equal(retryOff.extra.retry_badcase, false, "ретрай у модели включён по умолчанию — точка его выключает");
  const norm = m.find((r) => r.suffix === "_norm");
  assert.ok(norm, "точка _norm обязана быть");
  assert.equal(norm.extra.normalize, true);
});

test("matrixName: {uid}__{voice}__{N}_cfg{X}_ts{Y} — voice = спикер из POT", () => {
  const m = buildMatrix();
  assert.equal(matrixName(TRAIN_UID, "Narrator", 2, m[0]), `${TRAIN_UID}__Narrator__2_cfg1.5_ts10`);
  assert.equal(matrixName(TRAIN_UID, "Narrator", 14, m[13]), `${TRAIN_UID}__Narrator__14_cfg2.0_ts10_norm`);
  // все имена матрицы уникальны (иначе файлы перетрут друг друга)
  const names = m.map((r, i) => matrixName(TRAIN_UID, "Narrator", 2 + i, r));
  assert.equal(new Set(names).size, names.length);
});

test("runOpts: cfg/ts + extra + seed уходят шиму одним объектом", () => {
  const m = buildMatrix();
  assert.deepEqual(runOpts(m[0], 42), { cfg_value: 1.5, inference_timesteps: 10, seed: 42 });
  const off = m.find((r) => r.suffix === "_retryOff");
  assert.ok(off);
  assert.deepEqual(runOpts(off, 7), {
    cfg_value: 2.0,
    inference_timesteps: 10,
    retry_badcase: false,
    seed: 7,
  });
});

test("parseBenchCli: дефолты — тренировочный uid, ru, нумерация с 2", () => {
  const o = parseBenchCli([]);
  assert.equal(o.uid, TRAIN_UID);
  assert.equal(o.lang, "ru");
  assert.equal(o.start, 2);
  assert.equal(o.seed, 42);
  assert.equal(o.dryRun, false);
  assert.equal(o.only, undefined);
  // дефолты пилота = новые дефолты шима (вердикт владельца 2026-10-27)
  assert.equal(o.picks, 0, "без --picks работаем режимом матрицы");
  assert.equal(o.cfg, DEFAULT_CFG);
  assert.equal(o.cfg, 2.6, "cfg 2.6 — старт лестницы владельца (2.6 -0.2 .. 1.6), см. CFG_CALIBRATION");
  assert.equal(o.ts, DEFAULT_TIMESTEPS);
  assert.equal(o.ts, 30);
});

test("parseBenchCli: разбор опций и защита от мусора", () => {
  const o = parseBenchCli([
    "--uid",
    "abc123",
    "--start",
    "30",
    "--only",
    "7",
    "--seed",
    "1",
    "--picks",
    "10",
    "--cfg",
    "2.5",
    "--ts",
    "20",
    "--dry-run",
  ]);
  assert.equal(o.uid, "abc123");
  assert.equal(o.start, 30);
  assert.equal(o.only, 7);
  assert.equal(o.seed, 1);
  assert.equal(o.picks, 10);
  assert.deepEqual(o.cfgs, [], "без --cfgs — пусто (матричный режим по умолчанию)");
  assert.equal(o.cfg, 2.5);
  assert.equal(o.ts, 20);
  assert.equal(o.dryRun, true);
  assert.throws(() => parseBenchCli(["--wat"]), /неизвестная опция/);
  assert.throws(() => parseBenchCli(["--start", "0"]), />= 1/);
  assert.throws(() => parseBenchCli(["--only", "abc"]), />= 1/);
  assert.throws(() => parseBenchCli(["--picks", "-1"]), />= 0/);
  assert.throws(() => parseBenchCli(["--cfg", "0"]), /> 0/);
  assert.throws(() => parseBenchCli(["--ts", "abc"]), />= 1/);
  assert.throws(() => parseBenchCli(["--cfgs", "abc"]), /списком чисел/);
  assert.throws(() => parseBenchCli(["--cfgs", "0"]), /списком чисел/);
  assert.throws(() => parseBenchCli(["--cfgs", "2,,2.5"]), /списком чисел/);
  // --cfgs в пилоте раньше МОЛЧА терялся (ветки берут один o.cfg) — теперь стоп
  assert.throws(() => parseBenchCli(["--picks", "2", "--cfgs", "2,2.2"]), /только в матричном режиме/);
  assert.throws(() => parseBenchCli(["--each-voice", "--cfgs", "2,2.2"]), /только в матричном режиме/);
  // в матричном режиме (без пилота) --cfgs работает
  const m = parseBenchCli(["--cfgs", "2,2.25,2.5"]);
  assert.deepEqual(m.cfgs, [2, 2.25, 2.5]);
  assert.equal(m.picks, 0);
});

test("parseOpt: валидация по VOX_KNOBS — тип, ключ, дубль --cfg/--ts, недоступный", () => {
  assert.deepEqual(parseOpt("normalize=true"), ["normalize", true]);
  assert.deepEqual(parseOpt("retry_badcase=false"), ["retry_badcase", false]);
  assert.deepEqual(parseOpt("min_len=3"), ["min_len", 3]);
  assert.deepEqual(parseOpt("retry_badcase_ratio_threshold=6.5"), ["retry_badcase_ratio_threshold", 6.5]);
  // мусор -> стоп, а не молча игнорируемый шимом no-op
  assert.throws(() => parseOpt("normalise=true"), /неизвестный кнобок: normalise/);
  assert.throws(() => parseOpt("cfg_value=1.8"), /используй --cfg/);
  assert.throws(() => parseOpt("inference_timesteps=10"), /используй --ts/);
  assert.deepEqual(parseOpt("denoise=true"), ["denoise", true], "denoise доступен (2026-10-27)");
  assert.throws(() => parseOpt("normalize=1"), /true\/false/);
  assert.throws(() => parseOpt("min_len=abc"), /ждём число/);
  assert.throws(() => parseOpt("min_len"), /key=value/);
  assert.throws(() => parseOpt("=3"), /key=value/);
});

test("optTag: метка --opt в имени файла (сортировка по ключу — имена стабильны)", () => {
  assert.equal(optTag({}), "", "без --opt метки нет — имена как раньше");
  assert.equal(optTag({ denoise: true }), "_dn", "denoise -> компактный _dn (2026-10-28)");
  assert.equal(optTag({ normalize: true }), "_normalize=true");
  // порядок ключей на входе не важен: два аргумента -> одно и то же имя
  assert.equal(optTag({ retry_badcase: false, normalize: true }), optTag({ normalize: true, retry_badcase: false }));
  assert.equal(optTag({ normalize: true, retry_badcase: false }), "_normalize=true_retry_badcase=false");
});

test("кнобки: таблица доки синхронна с GEN_OPTS шима (DRY-гард)", () => {
  const py = readFileSync(fileURLToPath(new URL("./voxcpmworker.py", import.meta.url)), "utf8");
  const block = /GEN_OPTS = \(([\s\S]*?)\)/.exec(py);
  assert.ok(block, "блок GEN_OPTS в voxcpmworker.py не найден");
  const shimKeys = [...block[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  // устанавливаемые шимом кнобки == доступные в таблице (denoise исключён — off)
  const benchKeys = VOX_KNOBS.filter((k) => !k.off).map((k) => k.key);
  assert.deepEqual(benchKeys.toSorted(), shimKeys.toSorted(), "VOX_KNOBS разошёлся с GEN_OPTS");
  // denoise доступен (2026-10-27: проба владельца) и обязан идти в паре с
  // VOXCPM_DENOISER=1 — иначе шим даёт явную ошибку, а не молча no-op
  assert.ok(
    VOX_KNOBS.some((k) => k.key === "denoise" && !k.off),
    "denoise должен быть доступен",
  );
});

test("knobsText: справка --knobs печатает все кнобки, дефолты и ссылку на оф. доку", () => {
  const t = knobsText();
  for (const k of VOX_KNOBS) assert.ok(t.includes(k.key), `справка не содержит ${k.key}`);
  assert.match(t, /voxcpm\.readthedocs\.io/, "обязана ссылаться на офиц. usage guide");
  assert.match(t, /VOXCPM_DENOISER/, "denoise: справка обязана объяснять требование VOXCPM_DENOISER=1");
  assert.match(t, /seed/, "seed обязан упомянут — его нет в API generate()");
});

test("parseBenchCli: --uid в выборочном режиме помечается uidGiven (прицельная перегенерация)", () => {
  assert.equal(parseBenchCli([]).uidGiven, false, "без --uid дефолт не считается явным");
  const o = parseBenchCli(["--picks", "1", "--uid", "72cb0d2b390c3479ae1ed63bb8e6644c", "--seed", "42"]);
  assert.equal(o.uidGiven, true);
  assert.equal(o.uid, "72cb0d2b390c3479ae1ed63bb8e6644c");
  assert.equal(o.picks, 1);
});

test("parseBenchCli: --each-voice / --per-voice / --voice и защита от конфликтов режимов", () => {
  const def = parseBenchCli([]);
  assert.equal(def.eachVoice, false, "дефолт — не по-голосовой режим");
  assert.equal(def.perVoice, 1);
  assert.deepEqual(def.voices, []);
  const o = parseBenchCli(["--each-voice", "--per-voice", "3", "--voice", "Sarah", "--voice", "Kate, Alaric"]);
  assert.equal(o.eachVoice, true);
  assert.equal(o.perVoice, 3);
  assert.deepEqual(o.voices, ["Sarah", "Kate", "Alaric"], "список через запятую и повтор --voice складываются");
  assert.throws(() => parseBenchCli(["--per-voice", "0"]), />= 1/);
  assert.throws(() => parseBenchCli(["--each-voice", "--picks", "10"]), /не сочетается с --picks/);
  assert.throws(() => parseBenchCli(["--voice", "Sarah"]), /только с --picks\/--each-voice/);
  assert.throws(() => parseBenchCli(["--voice"]), /нет значения/);
});

test("filterByVoices: регистронезависимо, пустой фильтр = весь пул, неизвестный голос = стоп", () => {
  const pool = [
    fakePhrase("aaa111", "Prologue", "Narrator"),
    fakePhrase("bbb222", "Arc2", "Sarah"),
    fakePhrase("ccc333", "Arc3", "Sarah"),
    fakePhrase("ddd444", "Arc4", "Kate"),
  ];
  assert.equal(filterByVoices(pool, []).length, 4, "без --voice пул не трогаем");
  assert.equal(filterByVoices(pool, ["sarah"]).length, 2, "регистр не важен");
  assert.deepEqual(
    filterByVoices(pool, ["Kate"]).map((p) => p.uid),
    ["ddd444"],
  );
  assert.throws(() => filterByVoices(pool, ["Sraah"]), /неизвестный голос: Sraah[\s\S]*Kate, Narrator, Sarah/);
  assert.deepEqual(filterByVoices(pool, ["Sarah"]), filterByVoices(pool, ["SARAH"]));
});

test("buildPlan (--each-voice): по N фраз на каждый голос, имена {uid}__{voice}__Vox", () => {
  const pool = [
    fakePhrase("aaa111", "Prologue", "Narrator"),
    fakePhrase("bbb222", "Arc2", "Sarah"),
    fakePhrase("ccc333", "Arc3", "Sarah"),
    fakePhrase("ddd444", "Arc4", "Kate"),
    fakePhrase("eee555", "Arc5", "Kate"),
    fakePhrase("fff666", "Arc6", "Kate"),
  ];
  const one = buildPlan(parseBenchCli(["--each-voice"]), pool);
  assert.equal(one.length, 3, "по одной фразе на голос");
  assert.deepEqual(
    one.map((it) => it.phrase.voice).toSorted(),
    ["Kate", "Narrator", "Sarah"],
    "каждый голос ровно один раз",
  );
  const three = buildPlan(parseBenchCli(["--each-voice", "--per-voice", "3"]), pool);
  assert.equal(three.length, 6, "Sarah x2 + Kate x3 + Narrator x1 = 6");
  assert.ok(
    three.every(
      (it) =>
        it.name.endsWith(`__Vox_cfg${DEFAULT_CFG.toFixed(1)}_ts${DEFAULT_TIMESTEPS}`) &&
        it.wavPath.endsWith(`${it.name}.wav`),
    ),
    "все имена — {uid}__{voice}__Vox_cfg{cfg}.wav",
  );
  assert.equal(new Set(three.map((it) => it.name)).size, 6, "имена уникальны (файлы не перетрутся)");
  // детерминизм: тот же seed -> тот же состав; другой seed меняет ФРАЗЫ,
  // но не состав голосов; --voice (в main через filterByVoices) сужает пул ДО плана
  const again = buildPlan(parseBenchCli(["--each-voice", "--per-voice", "3"]), pool);
  assert.deepEqual(
    again.map((it) => it.name),
    three.map((it) => it.name),
    "тот же seed -> тот же состав и порядок",
  );
  const otherSeed = buildPlan(parseBenchCli(["--each-voice", "--per-voice", "3", "--seed", "7"]), pool);
  assert.equal(otherSeed.length, 6, "другой seed -> тот же состав по голосам");
  assert.deepEqual(otherSeed.map((it) => it.phrase.voice).toSorted(), three.map((it) => it.phrase.voice).toSorted());
  const sarahPool = filterByVoices(pool, ["sarah"]);
  const onlySarah = buildPlan(parseBenchCli(["--each-voice", "--per-voice", "3"]), sarahPool);
  assert.equal(onlySarah.length, 2, "у Sarah в пуле всего 2 фразы — третья не выдумывается");
  assert.ok(
    onlySarah.every((it) => it.phrase.voice === "Sarah"),
    "--voice оставляет только указанные голоса",
  );
  assert.ok(
    one.every((it) => it.cfg === DEFAULT_CFG && it.ts === 30),
    "по-голосовой режим идёт на дефолтном конфиге",
  );
});

test("parseBenchCli: --keep-prev/--emotion/--name-tag (A/B-пробы без затирания)", () => {
  const o = parseBenchCli([
    "--picks",
    "1",
    "--keep-prev",
    "--emotion",
    "Pleading desperation",
    "--name-tag",
    "emo new!",
  ]);
  assert.equal(o.keepPrev, true, "прошлые версии не удаляются");
  assert.equal(o.emotion, "Pleading desperation", "эмоция переопределяет POT-тон");
  assert.equal(o.nameTag, "emo_new_", "имя файла санитизируется");
  const def = parseBenchCli([]);
  assert.equal(def.keepPrev, false);
  assert.equal(def.emotion, "");
  assert.equal(def.nameTag, "");
  assert.equal(parseBenchCli([]).noEmotion, false);
  assert.equal(parseBenchCli(["--raw"]).raw, true, "--raw: без пост-конвейера");
  assert.equal(parseBenchCli([]).raw, false);
  assert.equal(parseBenchCli(["--no-emotion"]).noEmotion, true);
  assert.throws(() => parseBenchCli(["--no-emotion", "--emotion", "angry"]), /не сочетается/);
  const hf = parseBenchCli(["--hifi"]);
  assert.equal(hf.hifi, true);
  assert.equal(hf.nameTag, "hifi", "имя файла несёт факт Hi-Fi");
  assert.equal(parseBenchCli(["--hifi", "--name-tag", "mytag"]).nameTag, "mytag", "своя метка не затирается");
  assert.equal(buildPlan(o, [fakePhrase("u1", "Arc", "Sarah")])[0].name.endsWith("_emo_new_"), true);
});

test("parseBenchCli: --uids (список/дедуп/имплицирует пилот) и несочетаемость режимов", () => {
  const o = parseBenchCli(["--uids", "aaa, bbb,aaa"]);
  assert.deepEqual(o.uids, ["aaa", "bbb"], "список через запятую + дедуп");
  assert.equal(o.picks, 2, "--uids сам задаёт объём (picks = число uid'ов)");
  assert.throws(() => parseBenchCli(["--uids", "a", "--picks", "5"]), /не сочетается с --picks/);
  assert.throws(() => parseBenchCli(["--uids", "a", "--each-voice"]), /не сочетается с --each-voice/);
  assert.throws(() => parseBenchCli(["--uids", "a", "--uid", "b"]), /не сочетается с --uid/);
  assert.throws(() => parseBenchCli(["--uids"]), /нет значения/);
  // @файл — по uid на строку (формат --rejects судьи)
  const dir = mkdtempSync(join(tmpdir(), "voxbench-uids-"));
  try {
    const f = join(dir, "rejects.txt");
    writeFileSync(f, "u1\nu2\n\nu3\n");
    const fromFile = parseBenchCli(["--uids", `@${f}`]);
    assert.deepEqual(fromFile.uids, ["u1", "u2", "u3"], "пустые строки отбрасываются");
    assert.equal(fromFile.picks, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("filterByUids: arc/uid__voice однозначен, голый uid — только при одном кандидате", () => {
  // uid = md5(ТЕКСТА): один текст озвучивают несколько голосов/арок
  const pool = [
    fakePhrase("u1", "HassarPath", "Daemon"),
    fakePhrase("u1", "VargaMarionPath", "Marion"),
    fakePhrase("u2", "Other", "Sarah"),
  ];
  // точное совпадение arc/uid__voice — выбирает ровно бракованный файл
  assert.deepEqual(
    filterByUids(pool, ["VargaMarionPath/u1__Marion"]).map((p) => p.voice),
    ["Marion"],
  );
  // uid__voice без arc — тоже однозначно (голос уникален для этой пары)
  assert.deepEqual(
    filterByUids(pool, ["u1__Daemon"]).map((p) => p.voice),
    ["Daemon"],
  );
  // голый uid при одном кандидате — работает
  assert.deepEqual(
    filterByUids(pool, ["u2"]).map((p) => p.voice),
    ["Sarah"],
  );
  // порядок входа сохраняется (дедуп элементов делает parseBenchCli)
  assert.deepEqual(
    filterByUids(pool, ["u2", "u1__Daemon"]).map((p) => p.uid),
    ["u2", "u1"],
  );
});

test("filterByArc / --arc: фильтр арки, стоп с перечнем при отсутствии", () => {
  const pool = [
    fakePhrase("a1", "Prologue", "Sarah"),
    fakePhrase("a2", "MagePath", "Kate"),
    fakePhrase("a3", "prologue", "Narrator"),
  ];
  assert.deepEqual(
    filterByArc(pool, "Prologue").map((p) => p.uid),
    ["a1", "a3"],
    "регистронезависимо",
  );
  assert.throws(() => filterByArc(pool, "Nowhere"), /нет фраз в арке "Nowhere".*MagePath, Prologue/);
  const o = parseBenchCli(["--picks", "1", "--arc", "Prologue"]);
  assert.equal(o.arc, "Prologue");
  assert.throws(() => parseBenchCli(["--arc", "Prologue"]), /только с --picks/);
});

test("filterByUids: голый uid с несколькими голосами -> стоп «неоднозначно» с кандидатами", () => {
  const pool = [fakePhrase("u1", "ArcA", "Daemon"), fakePhrase("u1", "ArcB", "Marion")];
  assert.throws(
    () => filterByUids(pool, ["u1"]),
    (e: Error) => {
      assert.match(e.message, /неоднозначно 1/);
      assert.match(e.message, /ArcA\/Daemon/, "кандидаты перечислены");
      assert.match(e.message, /уточни arc\/uid__voice/);
      return true;
    },
  );
  // два совпадения и без arc, и с arc — тоже стоп
  assert.throws(() => filterByUids(pool, ["u1__NoSuch"]), /не найдено 1/);
  // часть найдена, часть нет — стоп с обоими перечнями
  assert.throws(
    () => filterByUids(pool, ["ArcA/u1__Daemon", "zzz"]),
    (e: Error) => {
      assert.match(e.message, /не найдено 1/);
      assert.ok(!e.message.includes("неоднозначно"));
      return true;
    },
  );
});

test("parseBenchCli + buildPlan: --seeds размножает прогоны в кандидатов _s{seed}", () => {
  const o = parseBenchCli(["--picks", "1", "--seeds", "7,42,43"]);
  assert.deepEqual(o.seeds, [7, 42, 43]);
  assert.throws(() => parseBenchCli(["--seeds", "abc"]), /целые >= 0/);
  assert.throws(() => parseBenchCli(["--seeds", "7,7"]), /минимум 2/, "дедуп до проверки: один seed = это --seed");
  const phrases = [fakePhrase("u1", "Arc", "Sarah")];
  const plan = buildPlan(o, phrases);
  assert.equal(plan.length, 3, "каждый прогон x каждый seed");
  assert.deepEqual(
    plan.map((p) => p.name),
    [
      phrases[0].uid + `__Sarah__Vox_cfg${DEFAULT_CFG.toFixed(1)}_ts${DEFAULT_TIMESTEPS}_s7`,
      phrases[0].uid + `__Sarah__Vox_cfg${DEFAULT_CFG.toFixed(1)}_ts${DEFAULT_TIMESTEPS}_s42`,
      phrases[0].uid + `__Sarah__Vox_cfg${DEFAULT_CFG.toFixed(1)}_ts${DEFAULT_TIMESTEPS}_s43`,
    ],
  );
  assert.deepEqual(
    plan.map((p) => p.seed),
    [7, 42, 43],
    "у кандидата свой seed",
  );
  assert.ok(plan.every((p) => p.wavPath.endsWith(`_s${p.seed}.wav`)));
  // без --seeds — прежнее поведение: один файл, поле seed не задано
  const plain = buildPlan(parseBenchCli(["--picks", "1"]), phrases);
  assert.equal(plain.length, 1);
  assert.equal(plain[0].seed, undefined);
  assert.ok(!plain[0].name.includes("_s"));
});

test("parseBenchCli: --opt копится в opts, --knobs поднимает флаг", () => {
  const o = parseBenchCli(["--opt", "normalize=true", "--opt", "min_len=3", "--knobs"]);
  assert.deepEqual(o.opts, { normalize: true, min_len: 3 });
  assert.equal(o.knobs, true);
  const def = parseBenchCli([]);
  assert.deepEqual(def.opts, {}, "без --opt пусто — прод-поведение не меняется");
  assert.equal(def.knobs, false);
  assert.throws(() => parseBenchCli(["--opt", "nonsense=1"]), /неизвестный кнобок/);
  assert.throws(() => parseBenchCli(["--opt"]), /нет значения/);
});

test("buildPlan с --opt: метка в имени + переопределение в extra (не затираем прошлые сэмплы)", () => {
  const phrases = [fakePhrase("aaa111", "Prologue", "Narrator"), fakePhrase("bbb222", "Arc2", "Sarah")];
  // пилот: имя получает метку, extra несёт кнобки в шим
  const pilot = buildPlan(parseBenchCli(["--picks", "2", "--opt", "normalize=true"]), phrases);
  assert.ok(
    pilot.every((it) => it.name.endsWith(`__Vox_cfg${DEFAULT_CFG.toFixed(1)}_ts${DEFAULT_TIMESTEPS}_normalize=true`)),
    `имя обязано нести метку --opt: ${pilot[0].name}`,
  );
  assert.ok(
    pilot.every((it) => it.extra.normalize === true),
    "extra обязан нести кнобок в genOpts",
  );
  // матрица: точечные extra точек сохраняются, --opt ложится поверх (поздний ключ выигрывает)
  const matrix = buildPlan(parseBenchCli(["--opt", "retry_badcase=false"]), [fakePhrase(TRAIN_UID, "P", "Narrator")]);
  const norm = matrix.find((it) => it.name.includes("_norm"));
  assert.ok(norm, "точка _norm должна остаться");
  assert.equal(norm.extra.normalize, true, "своё extra точки сохранено");
  assert.equal(norm.extra.retry_badcase, false, "--opt добавлен поверх");
  assert.ok(
    matrix.every((it) => it.name.endsWith("_retry_badcase=false")),
    "метка --opt дописана в имя всех точек",
  );
  // --opt доходит до genOpts (проверка источника: поздний ключ объекта выигрывает)
  const src = readFileSync(fileURLToPath(new URL("./voxcpm_bench.mts", import.meta.url)), "utf8");
  assert.match(src, /\.\.\.it\.extra/, "вызов generateRaw обязан разворачивать it.extra в genOpts");
});

test("buildPlan (матрица): 14 прогонов на одной фразе, имена с меткой конфига", () => {
  const phrases = [fakePhrase(TRAIN_UID, "Prologue", "Narrator")];
  const plan = buildPlan(parseBenchCli([]), phrases);
  assert.equal(plan.length, 14);
  assert.equal(plan[0].name, `${TRAIN_UID}__Narrator__2_cfg1.5_ts10`);
  assert.equal(plan[13].name, `${TRAIN_UID}__Narrator__15_cfg2.0_ts10_norm`);
  assert.ok(
    plan.every((it) => it.wavPath.includes("Prologue")),
    "все файлы матрицы — в папку арки фразы",
  );
  assert.ok(
    plan.every((it) => it.who.startsWith("cfg")),
    "в матрице колонка = конфиг",
  );
  // --only: ровно одна точка, номер = позиция в матрице
  const only = buildPlan(parseBenchCli(["--only", "5", "--start", "20"]), phrases);
  assert.equal(only.length, 1);
  assert.equal(only[0].n, 24, "номер = start + (индекс точки - 1)");
});

test("buildPlan (--cfgs): свой список cfg на одной фразе, общий ts", () => {
  const phrases = [fakePhrase(TRAIN_UID, "SailorArc", "Narrator")];
  const plan = buildPlan(parseBenchCli(["--cfgs", "2,2.25,2.5", "--ts", "30", "--start", "3"]), phrases);
  assert.equal(plan.length, 3);
  assert.deepEqual(
    plan.map((it) => it.cfg),
    [2, 2.25, 2.5],
  );
  assert.deepEqual(
    plan.map((it) => it.name),
    [
      `${TRAIN_UID}__Narrator__3_cfg2.0_ts30`,
      `${TRAIN_UID}__Narrator__4_cfg2.25_ts30`,
      `${TRAIN_UID}__Narrator__5_cfg2.5_ts30`,
    ],
  );
  assert.ok(
    plan.every((it) => it.ts === 30),
    "весь подбор на одном ts",
  );
  assert.ok(
    plan.every((it) => it.who.startsWith("cfg")),
    "колонка = конфиг, как в матрице",
  );
});

test("buildPlan (пилот --picks): каждая фраза -> {uid}__{voice}__Vox.wav в СВОЮ арку", () => {
  const phrases = [
    fakePhrase("aaa111", "Prologue", "Narrator"),
    fakePhrase("bbb222", "Arc2", "Sarah"),
    fakePhrase("ccc333", "Arc3", "Lilith"),
  ];
  const plan = buildPlan(parseBenchCli(["--picks", "3", "--start", "2"]), phrases);
  assert.equal(plan.length, 3);
  // выборка — перемешивание с seed: состав из пула, порядок любой, но стабильный
  const cfgTag = `__Vox_cfg${DEFAULT_CFG.toFixed(1)}_ts${DEFAULT_TIMESTEPS}`;
  assert.deepEqual(plan.map((it) => it.name).toSorted(), [
    `aaa111__Narrator${cfgTag}`,
    `bbb222__Sarah${cfgTag}`,
    `ccc333__Lilith${cfgTag}`,
  ]);
  const bbb = plan.find((it) => it.name.startsWith("bbb222"));
  assert.ok(bbb, "bbb222 должна попасть в план");
  assert.ok(bbb.wavPath.endsWith(join("Arc2", `bbb222__Sarah${cfgTag}.wav`)), bbb.wavPath);
  assert.ok(
    plan.every((it) => it.cfg === DEFAULT_CFG && it.ts === 30),
    "пилот идёт на дефолтном конфиге",
  );
  assert.equal(bbb.who, "Arc2/Sarah", "в пилоте колонка = арка/голос");
  // выборка детерминирована: тот же seed -> тот же порядок; --start на пилот
  // НЕ влияет (имя всегда {voice}__Vox, номера живут в матричном режиме)
  const again = buildPlan(parseBenchCli(["--picks", "3", "--start", "9"]), phrases);
  assert.deepEqual(
    again.map((it) => it.name),
    plan.map((it) => it.name),
  );
  // --picks больше пула -> весь пул, без падения
  assert.equal(buildPlan(parseBenchCli(["--picks", "10"]), phrases).length, 3);
});

test("measureLoudness: живой замер wav (нужен ffmpeg)", { skip: !HAS_FFMPEG }, () => {
  const dir = mkdtempSync(join(tmpdir(), "voxcpm-bench-"));
  try {
    const wav = join(dir, "sine.wav");
    const sr = 24000;
    const samples = Float32Array.from({ length: sr }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr));
    writeWav16(wav, samples, sr);
    const l = measureLoudness(wav);
    assert.ok(l, "замер должен вернуть значения");
    assert.ok(l.i !== null && l.i < 0, `интегральный уровень должен быть отрицательным, получили ${l.i}`);
    assert.ok(l.tp !== null && l.tp < 0, `true peak должен быть отрицательным, получили ${l.tp}`);
    assert.ok(l.lra !== null, "LRA должен быть измерим");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
