"""Тесты voice_catalog: сборка из фикстур, категории, label_arc, diff-манифесты."""

import hashlib
import json
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'generate', 'scripts'))

import voice_catalog  # noqa: E402
from voicekit import paths  # noqa: E402

# Дефолты модуля — фиксируем ДО вызовов build (он мутирует глобалы).
DEFAULT_TL_RU = voice_catalog.TL_RU
DEFAULT_CATALOG_DIR = voice_catalog.CATALOG_DIR


def _uid(text):
    return hashlib.md5(text.encode('utf-8')).hexdigest()


def _write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


TL_FIXTURE = '''# Arc: TestArc | Scene: TestScene

translate ru strings:

    old "Hello there"
    new "Привет"

    old "Menu item"
    new "Пункт меню"

    old "Narration line"
    new "Рассуждение"

    old "Closing narration"
    new "Финальное повествование"
'''

SCRIPT_FIXTURE = '''define s = Character("Sarah")

label test_scene:
    s "Hello there"
    "Narration line"
    jump other

label other:
    "Menu item" if True:
        jump test_scene
    "Closing narration"
'''


def _make_tree(tmp_path, tl_text=TL_FIXTURE):
    tl = str(tmp_path / 'tl')
    _write(os.path.join(tl, 'TestArc', 'TestScene.rpy'), tl_text)
    game = str(tmp_path / 'game_dir')
    _write(os.path.join(game, 'game', 'script.rpy'), SCRIPT_FIXTURE)
    out = str(tmp_path / 'out')
    return tl, game, out


def _load_entries(out):
    with open(os.path.join(out, 'voices.jsonl'), encoding='utf-8') as f:
        lines = [json.loads(l) for l in f if l.strip()]
    return lines[0], lines[1:]


def test_defaults_point_to_pkg_tl_and_catalog():
    assert DEFAULT_TL_RU == os.path.join(paths.PKG_ROOT, 'tl', 'ru')
    assert os.path.isdir(DEFAULT_TL_RU)
    assert DEFAULT_CATALOG_DIR == paths.CATALOG_DIR


def test_build_fixture(tmp_path):
    tl, game, out = _make_tree(tmp_path)
    voice_catalog.build(game_dir=game, out_dir=out, tl_dir=tl)

    meta, entries = _load_entries(out)
    by_old = {e['old']: e for e in entries}
    assert meta['totals']['total'] == 4

    hello = by_old['Hello there']
    assert hello['uid'] == _uid('Hello there')
    assert hello['new'] == 'Привет'
    assert hello['arc'] == 'TestArc'
    assert hello['scene'] == 'TestScene'
    assert hello['category'] == 'dialogue'
    assert hello['who'] == 's'
    assert hello['who_name'] == 'Sarah'

    assert by_old['Menu item']['category'] == 'menu'
    assert by_old['Narration line']['category'] == 'narration'
    assert by_old['Narration line']['who'] is None

    with open(os.path.join(out, 'label_arc.json'), encoding='utf-8') as f:
        label_arc = json.load(f)
    assert label_arc == {'test_scene': 'TestArc', 'other': 'TestArc'}


def test_build_diff_manifests(tmp_path, monkeypatch):
    monkeypatch.setattr(voice_catalog.paths, 'REPO_ROOT', str(tmp_path))
    _tl, game, _out = _make_tree(tmp_path / 'seed')

    # v1 каталог: One/Two/Four
    tl1 = str(tmp_path / 'v1' / 'tl')
    _write(os.path.join(tl1, 'TestArc', 'TestScene.rpy'), '''# Arc: TestArc | Scene: TestScene

translate ru strings:

    old "One"
    new "Один"

    old "Two"
    new "Два"

    old "Four"
    new "Четыре"
''')
    out1 = str(tmp_path / 'v1' / 'out')
    voice_catalog.build(game_dir=game, out_dir=out1, tl_dir=tl1)

    # v2: Two переведён заново (changed), Three добавлен (added), Four убран (dropped)
    tl2 = str(tmp_path / 'v2' / 'tl')
    _write(os.path.join(tl2, 'TestArc', 'TestScene.rpy'), '''# Arc: TestArc | Scene: TestScene

translate ru strings:

    old "One"
    new "Один"

    old "Two"
    new "Два-2"

    old "Three"
    new "Три"
''')
    voice_catalog.build(game_dir=game, out_dir=out1, tl_dir=tl2,
                        diff_with=os.path.join(out1, 'voices.jsonl'))

    delta = os.path.join(str(tmp_path), 'tmp', 'voice_delta')
    def _read(name):
        with open(os.path.join(delta, name), encoding='utf-8') as f:
            return f.read().split()
    # Было в v1: One/Two/Four; стало: One/Two(изменён)/Three
    assert _read('added.txt') == [_uid('Three')]
    assert _read('changed.txt') == [_uid('Two')]
    assert _read('dropped.txt') == [_uid('Four')]


def test_build_missing_script_exits(tmp_path):
    tl, _game, out = _make_tree(tmp_path)
    with pytest.raises(SystemExit):
        voice_catalog.build(game_dir=str(tmp_path / 'nope'), out_dir=out,
                            tl_dir=tl)
