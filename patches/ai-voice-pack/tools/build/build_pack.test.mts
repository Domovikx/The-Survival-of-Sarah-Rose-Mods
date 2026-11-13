/**
 * build_pack.test.mts — тесты раскладки дистрибутива (порт pytest-набора,
 * python-сборщик удалён 2026-11-13 вместе с миграцией дистрибутива на 7z).
 *
 * Тесты раскладки дистрибутива: инвариант атомарной папки мода.
 *
 * Установка = распаковка архива в корень игры; ВСЁ содержимое мода обязано лежать
 * в mods/tssr-ai-voice-pack/, кроме служебных README.txt и environment.txt
 * в корне. Ни один файл не имеет права «свешиваться» в game/ или корень —
 * только так uninstall = «удалить одну папку», а чужие моды не конфликтуют.
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BuildAbort,
  buildMain,
  buildVoice,
  ENVIRONMENT_TXT,
  hooks,
  MOD_DIR,
  MOD_EXCLUDE,
  PATCH,
  resetCatalogCache,
  treeFiles,
  VOICE_LANGS,
} from "./build_pack.mts";
import { readArchive, type ArchiveRead } from "./archive.mts";

// tools/build/build_pack.test.mts -> ../.. = patches/ai-voice-pack
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT_FILES = new Set(["README.txt", "environment.txt", "install.cmd", "worker.ps1"]);
const INSTALLER_DIR = join(ROOT, "tools", "build", "installer");

/** tmp_path в pytest: создаём временный каталог, чистим за собой. */
function withTmp(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "tssr_build_layout_"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Собрать main.7z во временный каталог (дерево репы реальное, быстро).
 * level 0 — тесты проверяют РАСКЛАДКУ, а не степень сжатия: -mx=9 на 63 MiB
 * шрифтов добавлял бы к каждому вызову ~8 с. */
function buildMainPack(dir: string): ArchiveRead {
  return readArchive(buildMain(dir, { level: 0 }).target);
}

function test_mod_dir_is_atomic(): void {
  /* Папка установки — одна, с именем мода (не контейнер mods/ сам по себе). */
  assert.equal(MOD_DIR, "mods/tssr-ai-voice-pack");
}

function test_main_pack_root_has_only_service_files(): void {
  /* В корне архива — только README.txt и environment.txt; всё остальное в mods/. */
  withTmp((tmp) => {
    const top = new Set(buildMainPack(tmp).names.map((n) => n.split("/")[0]));
    assert.deepEqual([...top].toSorted(), [...ROOT_FILES, "mods"].toSorted());
  });
}

function test_main_pack_nothing_outside_mod_dir(): void {
  /* Ни один файл лежит вне атомарной папки мода (кроме служебных в корне). */
  withTmp((tmp) => {
    const names = buildMainPack(tmp).names;
    const prefix = MOD_DIR + "/";
    for (const n of names) {
      assert.ok(ROOT_FILES.has(n) || n.startsWith(prefix), `файл свесился из папки мода: ${n}`);
    }
  });
}

function test_main_pack_no_game_injection(): void {
  /* В архиве нет game/ — мод не трогает официальные файлы игры. */
  withTmp((tmp) => {
    const names = buildMainPack(tmp).names;
    assert.ok(!names.some((n) => n.startsWith("game/")));
  });
}

function test_main_pack_key_files_in_mod_dir(): void {
  /* Ключевые файлы мода на месте — внутри атомарной папки. */
  withTmp((tmp) => {
    const names = new Set(buildMainPack(tmp).names);
    const p = MOD_DIR + "/";
    assert.ok(names.has(p + "voice_config.rpy"));
    assert.ok(names.has(p + "zzz_ui.rpy"));
    assert.ok(names.has(p + "zzz_update_check.rpy"));
    assert.ok(names.has(p + "catalog/label_arc.json"));
    assert.ok(names.has(p + "catalog/voice_list.json"));
    assert.ok([...names].some((n) => n.startsWith(p + "tl/ru/")));
  });
}

function test_main_pack_no_dev_only_trees(): void {
  /* dev-only (casts/рефы, po/исходники, кэши) не уезжают в дистрибутив
   * (владелец 2026-11-11: «main — небольшой, без чего работать не будет»). */
  withTmp((tmp) => {
    const names = buildMainPack(tmp).names;
    const p = MOD_DIR + "/";
    for (const dev of ["casts/", "po/", ".pytest_cache/"]) {
      assert.ok(!names.some((n) => n.startsWith(p + dev)), `dev-дерево в дистрибутиве: ${dev}`);
    }
  });
}

function test_main_pack_fonts_complete(): void {
  /* В main — ВСЕ шрифты (владелец 2026-11-12: шрифт = часть текста,
   * текст живёт в main; без CJK-шрифта иероглифы = квадраты). */
  withTmp((tmp) => {
    const fonts = new Set(
      buildMainPack(tmp)
        .names.filter((n) => n.includes("/fonts/"))
        .map((n) => n.split("/").pop()),
    );
    assert.ok(fonts.has("Literata-Regular.ttf") && fonts.has("Literata-Bold.ttf"), "UI-шрифты пропали");
    for (const cjk of ["NotoSansCJKjp-Regular.otf", "NotoSansCJKkr-Regular.otf", "NotoSansCJKsc-Regular.otf"]) {
      assert.ok(fonts.has(cjk), `CJK-шрифт в main: ${cjk}`);
    }
  });
}

function test_voice_pack_has_own_installer(t: TestContext): void {
  /* Каждый voice-пакет несёт СВОЙ атомарный установщик в корне (владелец
   * 2026-11-12: «отдельные аудио-установщики» + предохранитель на ядро main). */
  withTmp((tmp) => {
    const res = buildVoice("ru", tmp);
    if (res === null) {
      t.skip("audio/ru пуст");
      return;
    }
    const top = new Set(readArchive(res.target).names.map((n) => n.split("/")[0]));
    assert.ok(top.has("install.cmd"), `нет install.cmd в корне voice-пакета: ${[...top]}`);
    assert.ok(top.has("worker.ps1"), `нет worker.ps1 в корне voice-пакета: ${[...top]}`);
  });
}

function test_main_pack_repo_diagnostics_not_shipped(): void {
  /* Dev-only файлы репы (README/MOD.md, tools/, tests/, audio/) в
   * дистрибутив не идут; каталог шиппится только allowlist'ом (2 JSON). */
  withTmp((tmp) => {
    const names = buildMainPack(tmp).names;
    const p = MOD_DIR + "/";
    const rels = names.filter((n) => n.startsWith(p)).map((n) => n.slice(p.length));
    const tops = new Set(rels.map((r) => r.split("/")[0]));
    for (const fn of MOD_EXCLUDE) {
      if (fn !== "catalog") assert.ok(!tops.has(fn), fn); // каталог шиппится, но только runtime-пара
    }
    const catalog = rels.filter((r) => r.startsWith("catalog/")).toSorted();
    assert.deepEqual(catalog, ["catalog/label_arc.json", "catalog/voice_list.json"]);
  });
}

function test_pack_catalog_is_build_artifact_with_valid_content(): void {
  /* Сборочный каталог в архиве: label_arc из POT-инвентаря (документированные
   * фиксы артефактов на месте), voice_list из casts (names+narrator).
   * В репе catalog/ не живёт — легаси выпищен 2026-10-22. */
  assert.ok(!existsSync(join(ROOT, "catalog")), "catalog/ должен отсутствовать в репе (артефакты сборки)");
  withTmp((tmp) => {
    const zf = buildMainPack(tmp);
    const arc = JSON.parse(zf.read(MOD_DIR + "/catalog/label_arc.json").toString("utf-8")) as Record<string, string>;
    const vl = JSON.parse(zf.read(MOD_DIR + "/catalog/voice_list.json").toString("utf-8")) as {
      narrator: string;
      names: Record<string, string>;
    };
    assert.ok(Object.keys(arc).length >= 100, String(Object.keys(arc).length));
    // Документированные фиксы артефактов прежнего label_arc.json (3 шт.).
    assert.equal(arc["VargaPath5"], "VargaMarionPath");
    assert.equal(arc["TrainingPathKate3"], "Training");
    assert.equal(arc["prostitutealaric1"], "Other");
    assert.equal(vl["narrator"], "Narrator");
    assert.equal(vl["names"]["Narrator"], "Narrator");
  });
}

function test_build_stops_with_clear_error_when_catalog_gen_fails(): void {
  /* Edge: генератор каталога упал — сборка валится с понятной ошибкой,
   * а не пишет пустой/неполный каталог в дистрибутив. */
  withTmp((tmp) => {
    const orig = hooks.runCatalogGen;
    hooks.runCatalogGen = () => ({ returncode: 1, stdout: "boom out", stderr: "boom err" });
    resetCatalogCache();
    try {
      let caught: unknown;
      try {
        buildMain(tmp);
      } catch (e) {
        caught = e;
      }
      if (!(caught instanceof BuildAbort)) {
        assert.fail(`ожидалась остановка сборки: ${String(caught)}`);
      }
      assert.ok(caught.message.includes("СБОРКА ОСТАНОВЛЕНА"), `нет маркера остановки: ${caught.message}`);
    } finally {
      hooks.runCatalogGen = orig;
      resetCatalogCache();
    }
  });
}

function test_environment_txt_is_relative(): void {
  /* environment.txt указывает на mods относительно корня игры — без
   * абсолютных путей (иначе мод не загрузится на чужой машине). */
  assert.ok(ENVIRONMENT_TXT.includes('RENPY_SEARCHPATH = "mods"'));
  assert.ok(!ENVIRONMENT_TXT.includes("C:"));
  assert.ok(!ENVIRONMENT_TXT.includes("\\\\"));
}

function test_environment_txt_in_pack(): void {
  withTmp((tmp) => {
    const env = buildMainPack(tmp).read("environment.txt").toString("utf-8");
    assert.ok(env.includes('RENPY_SEARCHPATH = "mods"'));
  });
}

function test_voice_pack_files_in_mod_dir(): void {
  /* Озвучка кладётся в mods/<папка>/ai_voice/<lang>/ (дерево фейковое). */
  withTmp((tmp) => {
    const src = join(tmp, "ru", "OpeningScene");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "deadbeef__Sarah_3.opus"), Buffer.from("fake"));
    // monkeypatch VOICE_LANGS (как setattr в pytest) — с откатом
    const orig = { ...VOICE_LANGS };
    for (const k of Object.keys(VOICE_LANGS)) delete VOICE_LANGS[k];
    VOICE_LANGS["ru"] = join(tmp, "ru");
    try {
      const out = join(tmp, "dist");
      mkdirSync(out);
      const res = buildVoice("ru", out);
      assert.ok(res, "voice-пакет не собран");
      // 7z не гарантирует порядок файлов в листинге — сравниваем состав.
      assert.deepEqual(
        readArchive(res.target).names.toSorted(),
        [
          MOD_DIR + "/ai_voice/ru/OpeningScene/deadbeef__Sarah_3.opus",
          // свой атомарный установщик в корне пакета (владелец 2026-11-12)
          "install.cmd",
          "worker.ps1",
        ].toSorted(),
      );
    } finally {
      for (const k of Object.keys(VOICE_LANGS)) delete VOICE_LANGS[k];
      Object.assign(VOICE_LANGS, orig);
    }
  });
}

// --- Статические проверки rpy-исходников (раскладка репы -> раскладка мода) ---

/** Исходник установщика: ОБЯЗАТЕЛЬНО UTF-8 BOM (PowerShell 5 иначе
 * коверкает кириллицу в консоли). */
function installerSrc(name: string): string {
  const raw = readFileSync(join(INSTALLER_DIR, name));
  assert.ok(raw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), `${name}: нет UTF-8 BOM`);
  return raw.subarray(3).toString("utf-8");
}

function test_installers_wait_for_game_to_close(): void {
  /* Установщики не воюют с запущенной игрой: игра держит локи на шрифтах
   * и файлах мода, поэтому ждём закрытия, затем ставим (поймано на чистой
   * установке 2026-11-12 — «папка занята другим процессом»). */
  for (const name of ["worker.ps1", "voice_install.ps1"]) {
    const src = installerSrc(name);
    assert.ok(src.includes("Get-GameProcess"), `${name}: нет проверки запущенной игры`);
    assert.ok(src.includes("the game is still running"), `${name}: нет понятной ошибки`);
    assert.ok(src.includes("exit 4"), `${name}: защита не возвращает код 4`);
  }
}

function test_install_cmd_console_is_utf8(): void {
  /* install.cmd переключает консоль в UTF-8: сообщения установщика
   * русские, а CP866/CP437 на другой локали дают кракозябры — включая
   * предохранитель «сначала поставьте main» (поймано 2026-11-12 на прогоне
   * пользовательского сценария: вывод в лог был нечитаемым). */
  const src = readFileSync(join(INSTALLER_DIR, "install.cmd"))
    .toString("utf-8")
    .replace(/^\uFEFF/, "");
  assert.ok(src.includes("chcp 65001"), "install.cmd: консоль не переключена в UTF-8");
  assert.ok(src.indexOf("chcp 65001") < src.indexOf("powershell"), "chcp должен стоять ДО запуска powershell");
}

function test_core_installer_never_touches_ai_voice(): void {
  /* main.7z — БЕЗ аудио: установщик ядра пропускает ai_voice (голоса
   * живут в своих пакетах — решение владельца 2026-11-12). */
  assert.ok(installerSrc("worker.ps1").includes('if ($entry.Name -eq "ai_voice") { continue }'));
}

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf-8");
}

/** Гард регресса (владелец 2026-11-13): рантайм-связка voice_config — без
 * чтения catalog-JSON и auto_voice-хука игра молчит (голоса не находятся). */
function test_voice_config_wires_catalog_and_auto_voice() {
  const src = readFileSync(join(PATCH, "voice_config.rpy"), "utf-8");
  assert.ok(
    src.includes('renpy.loader.load("catalog/label_arc.json")'),
    "label_arc.json не читается — папки ai_voice/<Арка>/ не найдутся",
  );
  assert.ok(
    src.includes('renpy.loader.load("catalog/voice_list.json")'),
    "voice_list.json не читается — неизвестно, кто озвучен",
  );
  assert.ok(
    src.includes("define config.auto_voice = static_auto_voice"),
    "auto_voice-хук не подключён — движок не ищет голоса",
  );
}

function test_voice_config_registers_own_mod_dir(): void {
  /* voice_config.rpy добавляет в searchpath свою папку (рано, init -999),
   * а не хак с пустым путём/корнем проекта. */
  const src = readSrc("voice_config.rpy");
  assert.ok(src.includes("init -999 python:"));
  assert.ok(src.includes("_MOD_REL"));
  assert.ok(src.includes("searchpath.append(_MOD_REL)"));
  assert.ok(!src.includes('searchpath.append("")'));
  assert.ok(!src.includes("_PROJ_ROOT"));
}

function test_no_basedir_mod_writes(): void {
  /* Диагностические файлы пишутся в папку мода, а не в basedir/mod. */
  for (const rel of ["zzz_ui.rpy", "zzz_update_check.rpy"]) {
    const src = readSrc(rel);
    assert.ok(!src.includes('config.basedir, "mod"'), rel);
    assert.ok(src.includes("_TSSR_MOD_DIR"), rel);
  }
}

function test_rpy_sources_never_use_dunder_file(): void {
  /* __file__ в python-блоках — это движковой renpy/minstore.py (неймспейс
   * store), а НЕ наш .rpy: в установке оттуда падал dirname() и мод «уезжал»
   * в папку движка. Ни один rpy-исходник не имеет права читать путь от __file__
   * (комментарии-предупреждения разрешены). */
  for (const rel of ["voice_config.rpy", "zzz_ui.rpy", "zzz_update_check.rpy"]) {
    for (const line of readSrc(rel).split(/\r?\n/)) {
      const code = line.split("#", 1)[0];
      assert.ok(!code.includes("__file__"), `${rel}: ${line.trim()}`);
    }
  }
}

function test_mod_root_canonical_fallback_is_mod_dir(): void {
  /* Канонический фолбэк-путь в каждом rpy == MOD_DIR из build_pack —
   * единая точка правды для имени папки установки. */
  const suffix = '"mods", "tssr-ai-voice-pack"';
  for (const rel of ["voice_config.rpy", "zzz_ui.rpy", "zzz_update_check.rpy"]) {
    assert.ok(readSrc(rel).includes(suffix), rel);
  }
  assert.equal(MOD_DIR, "mods/tssr-ai-voice-pack");
}

function test_main_pack_ships_no_rpyc(): void {
  /* Скомпилированный байткод не шиппим: движок скомпилирует .rpy при
   * первом запуске; пара rpy+rpyc в архиве = тихая рассинхронизация
   * (решение 2026-10-19; из git .rpyc тоже вычищены). */
  withTmp((tmp) => {
    const names = buildMainPack(tmp).names;
    assert.ok(!names.some((n) => n.endsWith(".rpyc")), names.join(", "));
  });
}

function test_main_pack_is_mirror_of_patch_tree(): void {
  /* Зеркало установки: состав архива == дерево патча — «карта путей»
   * физически невозможна: файл едет по своему относительному пути, новый
   * файл попадает в дистрибутив сам (решение 2026-10-19). */
  withTmp((tmp) => {
    const names = buildMainPack(tmp).names;
    const p = MOD_DIR + "/";
    const shipped = new Set(names.filter((n) => n.startsWith(p)).map((n) => n.slice(p.length)));
    const tree = new Set(treeFiles(PATCH, MOD_EXCLUDE).map((f) => relative(PATCH, f).split(sep).join("/")));
    const runtime = new Set(["catalog/label_arc.json", "catalog/voice_list.json"]);
    assert.deepEqual([...shipped].toSorted(), [...new Set([...tree, ...runtime])].toSorted());
  });
}

function test_patch_root_is_install_mirror(): void {
  /* В репе больше нет mod/, tools/generate/catalog и каталога-легаси
   * catalog/: корень патча сам является папкой мода, рантайм-мапы —
   * артефакты сборки (catalog_gen.mts: POT + casts). */
  assert.ok(!existsSync(join(ROOT, "mod")));
  assert.ok(!existsSync(join(ROOT, "tools", "generate", "catalog")));
  assert.ok(
    !existsSync(join(ROOT, "catalog")),
    "каталог-легаси в репе запрещён (см. tasks/2026-10-22-catalog-legacy-removal)",
  );
  for (const rel of ["zzz_ui.rpy", "zzz_update_check.rpy", "fonts/Literata-Regular.ttf", "images/ui/round.png"]) {
    assert.ok(existsSync(join(ROOT, rel)), rel);
  }
}

// Регистрация в порядке pytest-файла (node:test гоняет их последовательно).
test("test_mod_dir_is_atomic", test_mod_dir_is_atomic);
test("test_main_pack_root_has_only_service_files", test_main_pack_root_has_only_service_files);
test("test_main_pack_nothing_outside_mod_dir", test_main_pack_nothing_outside_mod_dir);
test("test_main_pack_no_game_injection", test_main_pack_no_game_injection);
test("test_main_pack_key_files_in_mod_dir", test_main_pack_key_files_in_mod_dir);
test("test_main_pack_no_dev_only_trees", test_main_pack_no_dev_only_trees);
test("test_main_pack_fonts_complete", test_main_pack_fonts_complete);
test("test_voice_pack_has_own_installer", test_voice_pack_has_own_installer);
test("test_main_pack_repo_diagnostics_not_shipped", test_main_pack_repo_diagnostics_not_shipped);
test("test_pack_catalog_is_build_artifact_with_valid_content", test_pack_catalog_is_build_artifact_with_valid_content);
test(
  "test_build_stops_with_clear_error_when_catalog_gen_fails",
  test_build_stops_with_clear_error_when_catalog_gen_fails,
);
test("test_environment_txt_is_relative", test_environment_txt_is_relative);
test("test_environment_txt_in_pack", test_environment_txt_in_pack);
test("test_voice_pack_files_in_mod_dir", test_voice_pack_files_in_mod_dir);
test("test_installers_wait_for_game_to_close", test_installers_wait_for_game_to_close);
test("test_install_cmd_console_is_utf8", test_install_cmd_console_is_utf8);
test("test_core_installer_never_touches_ai_voice", test_core_installer_never_touches_ai_voice);
test("test_voice_config_registers_own_mod_dir", test_voice_config_registers_own_mod_dir);
test("test_voice_config_wires_catalog_and_auto_voice", test_voice_config_wires_catalog_and_auto_voice);
test("test_no_basedir_mod_writes", test_no_basedir_mod_writes);
test("test_rpy_sources_never_use_dunder_file", test_rpy_sources_never_use_dunder_file);
test("test_mod_root_canonical_fallback_is_mod_dir", test_mod_root_canonical_fallback_is_mod_dir);
test("test_main_pack_ships_no_rpyc", test_main_pack_ships_no_rpyc);
test("test_main_pack_is_mirror_of_patch_tree", test_main_pack_is_mirror_of_patch_tree);
test("test_patch_root_is_install_mirror", test_patch_root_is_install_mirror);
