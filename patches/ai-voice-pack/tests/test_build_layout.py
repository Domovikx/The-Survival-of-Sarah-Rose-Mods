"""Тесты раскладки дистрибутива: инвариант атомарной папки мода.

Установка = распаковка zip в корень игры; ВСЁ содержимое мода обязано лежать
в mods/tssr-ai-voice-pack/, кроме служебных INSTALL.txt и environment.txt
в корне. Ни один файл не имеет права «свешиваться» в game/ или корень —
только так uninstall = «удалить одну папку», а чужие моды не конфликтуют.
"""

import json
import os
import sys
import zipfile

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'build'))

import build_pack  # noqa: E402

ROOT_FILES = {"INSTALL.txt", "environment.txt"}


def _build_main(tmp_path):
    """Собрать main.zip во временный каталог (дерево репы реальное, быстро)."""
    name, target, nfiles, nbytes = build_pack.build_main(tmp_path)
    return zipfile.ZipFile(target)


def test_mod_dir_is_atomic():
    """Папка установки — одна, с именем мода (не контейнер mods/ сам по себе)."""
    assert build_pack.MOD_DIR == "mods/tssr-ai-voice-pack"


def test_main_zip_root_has_only_service_files(tmp_path):
    """В корне zip — только INSTALL.txt и environment.txt; всё остальное в mods/."""
    with _build_main(tmp_path) as zf:
        names = zf.namelist()
    top = {n.split("/")[0] for n in names}
    assert top == ROOT_FILES | {"mods"}


def test_main_zip_nothing_outside_mod_dir(tmp_path):
    """Ни один файл лежит вне атомарной папки мода (кроме служебных в корне)."""
    with _build_main(tmp_path) as zf:
        names = zf.namelist()
    prefix = build_pack.MOD_DIR + "/"
    for n in names:
        assert n in ROOT_FILES or n.startswith(prefix), \
            "файл свесился из папки мода: %s" % n


def test_main_zip_no_game_injection(tmp_path):
    """В зипе нет game/ — мод не трогает официальные файлы игры."""
    with _build_main(tmp_path) as zf:
        names = zf.namelist()
    assert not [n for n in names if n.startswith("game/")]


def test_main_zip_key_files_in_mod_dir(tmp_path):
    """Ключевые файлы мода на месте — внутри атомарной папки."""
    with _build_main(tmp_path) as zf:
        names = set(zf.namelist())
    p = build_pack.MOD_DIR + "/"
    assert p + "voice_config.rpy" in names
    assert p + "zzz_ui.rpy" in names
    assert p + "zzz_update_check.rpy" in names
    assert p + "catalog/label_arc.json" in names
    assert p + "catalog/voice_list.json" in names
    assert any(n.startswith(p + "tl/ru/") for n in names)


def test_main_zip_repo_diagnostics_not_shipped(tmp_path):
    """Dev-only файлы репы (README/MOD.md, tools/, tests/, audio/) в
    дистрибутив не идут; каталог шиппится только allowlist'ом (2 JSON)."""
    with _build_main(tmp_path) as zf:
        names = zf.namelist()
    p = build_pack.MOD_DIR + "/"
    rels = [n[len(p):] for n in names if n.startswith(p)]
    tops = {r.split("/")[0] for r in rels}
    for fn in build_pack.MOD_EXCLUDE:
        if fn != "catalog":  # каталог шиппится, но только runtime-пара
            assert fn not in tops, fn
    catalog = sorted(r for r in rels if r.startswith("catalog/"))
    assert catalog == ["catalog/label_arc.json", "catalog/voice_list.json"]


def test_zip_catalog_is_build_artifact_with_valid_content(tmp_path):
    """Сборочный каталог в зипе: label_arc из POT-инвентаря (документированные
    фиксы артефактов на месте), voice_list из casts (names+narrator).
    В репе catalog/ не живёт — легаси выпищен 2026-10-22."""
    assert not os.path.exists(os.path.join(ROOT, "catalog")), \
        "catalog/ должен отсутствовать в репе (артефакты сборки)"
    with _build_main(tmp_path) as zf:
        arc = json.loads(zf.read(build_pack.MOD_DIR + "/catalog/label_arc.json"))
        vl = json.loads(zf.read(build_pack.MOD_DIR + "/catalog/voice_list.json"))
    assert len(arc) >= 100, len(arc)
    # Документированные фиксы артефактов прежнего label_arc.json (3 шт.).
    assert arc["VargaPath5"] == "VargaMarionPath"
    assert arc["TrainingPathKate3"] == "Training"
    assert arc["prostitutealaric1"] == "Other"
    assert vl["narrator"] == "Narrator"
    assert vl["names"]["Narrator"] == "Narrator"


def test_build_stops_with_clear_error_when_catalog_gen_fails(tmp_path, monkeypatch):
    """Edge: генератор каталога упал — сборка валится с понятной ошибкой,
    а не пишет пустой/неполный каталог в дистрибутив."""
    class _Fail:
        returncode = 1
        stdout = "boom out"
        stderr = "boom err"

    monkeypatch.setattr(build_pack.subprocess, "run", lambda *a, **k: _Fail())
    monkeypatch.setattr(build_pack, "_catalog_cache", None)
    with pytest.raises(SystemExit) as ei:
        build_pack.build_main(tmp_path)
    assert "СБОРКА ОСТАНОВЛЕНА" in str(ei.value)


def test_environment_txt_is_relative():
    """environment.txt указывает на mods относительно корня игры — без
    абсолютных путей (иначе мод не загрузится на чужой машине)."""
    assert 'RENPY_SEARCHPATH = "mods"' in build_pack.ENVIRONMENT_TXT
    assert "C:" not in build_pack.ENVIRONMENT_TXT
    assert "\\\\" not in build_pack.ENVIRONMENT_TXT


def test_environment_txt_in_zip(tmp_path):
    with _build_main(tmp_path) as zf:
        env = zf.read("environment.txt").decode("utf-8")
    assert 'RENPY_SEARCHPATH = "mods"' in env


def test_voice_zip_files_in_mod_dir(tmp_path, monkeypatch):
    """Озвучка кладётся в mods/<папка>/ai_voice/<lang>/ (дерево фейковое)."""
    src = tmp_path / "ru" / "OpeningScene"
    src.mkdir(parents=True)
    (src / "deadbeef__Sarah_3.opus").write_bytes(b"fake")
    monkeypatch.setattr(build_pack, "VOICE_LANGS", {"ru": tmp_path / "ru"})
    out = tmp_path / "dist"
    out.mkdir()
    name, target, nfiles, nbytes = build_pack.build_voice("ru", out)
    with zipfile.ZipFile(target) as zf:
        names = zf.namelist()
    assert names == [
        build_pack.MOD_DIR + "/ai_voice/ru/OpeningScene/deadbeef__Sarah_3.opus"
    ]


# --- Статические проверки rpy-исходников (раскладка репы -> раскладка мода) ---


def _read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def test_voice_config_registers_own_mod_dir():
    """voice_config.rpy добавляет в searchpath свою папку (рано, init -999),
    а не хак с пустым путём/корнем проекта."""
    src = _read("voice_config.rpy")
    assert "init -999 python:" in src
    assert "_MOD_REL" in src
    assert "searchpath.append(_MOD_REL)" in src
    assert 'searchpath.append("")' not in src
    assert "_PROJ_ROOT" not in src


def test_no_basedir_mod_writes():
    """Диагностические файлы пишутся в папку мода, а не в basedir/mod."""
    for rel in ("zzz_ui.rpy", "zzz_update_check.rpy"):
        src = _read(rel)
        assert 'config.basedir, "mod"' not in src, rel
        assert "_TSSR_MOD_DIR" in src, rel


def test_rpy_sources_never_use_dunder_file():
    """__file__ в python-блоках — это движковой renpy/minstore.py (неймспейс
    store), а НЕ наш .rpy: в установке оттуда падал dirname() и мод «уезжал»
    в папку движка. Ни один rpy-исходник не имеет права читать путь от __file__
    (комментарии-предупреждения разрешены)."""
    for rel in ("voice_config.rpy", "zzz_ui.rpy", "zzz_update_check.rpy"):
        for line in _read(rel).splitlines():
            code = line.split("#", 1)[0]
            assert "__file__" not in code, "%s: %s" % (rel, line.strip())


def test_mod_root_canonical_fallback_is_mod_dir():
    """Канонический фолбэк-путь в каждом rpy == MOD_DIR из build_pack —
    единая точка правды для имени папки установки."""
    suffix = '"mods", "tssr-ai-voice-pack"'
    for rel in ("voice_config.rpy", "zzz_ui.rpy", "zzz_update_check.rpy"):
        assert suffix in _read(rel), rel
    assert build_pack.MOD_DIR == "mods/tssr-ai-voice-pack"


def test_main_zip_ships_no_rpyc(tmp_path):
    """Скомпилированный байткод не шиппим: движок скомпилирует .rpy при
    первом запуске; пара rpy+rpyc в зипе = тихая рассинхронизация
    (решение 2026-10-19; из git .rpyc тоже вычищены)."""
    with _build_main(tmp_path) as zf:
        names = zf.namelist()
    assert not [n for n in names if n.endswith(".rpyc")], names


def test_main_zip_is_mirror_of_patch_tree(tmp_path):
    """Зеркало установки: состав зипа == дерево патча — «карта путей»
    физически невозможна: файл едет по своему относительному пути, новый
    файл попадает в дистрибутив сам (решение 2026-10-19)."""
    with _build_main(tmp_path) as zf:
        names = zf.namelist()
    p = build_pack.MOD_DIR + "/"
    shipped = {n[len(p):] for n in names if n.startswith(p)}
    tree = {
        os.path.relpath(str(f), str(build_pack.PATCH)).replace("\\", "/")
        for f in build_pack._tree_files(build_pack.PATCH, build_pack.MOD_EXCLUDE)
    }
    runtime = {"catalog/label_arc.json", "catalog/voice_list.json"}
    assert shipped == tree | runtime


def test_patch_root_is_install_mirror():
    """В репе больше нет mod/, tools/generate/catalog и каталога-легаси
    catalog/: корень патча сам является папкой мода, рантайм-мапы —
    артефакты сборки (catalog_gen.mts: POT + casts)."""
    assert not os.path.exists(os.path.join(ROOT, "mod"))
    assert not os.path.exists(os.path.join(ROOT, "tools", "generate", "catalog"))
    assert not os.path.exists(os.path.join(ROOT, "catalog")), \
        "каталог-легаси в репе запрещён (см. tasks/2026-10-22-catalog-legacy-removal)"
    for rel in ("zzz_ui.rpy", "zzz_update_check.rpy",
                "fonts/Literata-Regular.ttf", "images/ui/round.png"):
        assert os.path.isfile(os.path.join(ROOT, rel)), rel
