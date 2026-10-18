"""Тесты voice_sync: классификация mp3, миграция ref/+in_progress/ -> корень."""

import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))

import yaml  # noqa: E402

from voicekit import paths  # noqa: E402
import voice_sync  # noqa: E402


def test_mp3_classify_basic():
    c = voice_sync.mp3_classify
    assert c('Alaric', 'Alaric.mp3') == ('gen_selected', 'Alaric.mp3')
    assert c('Alaric', '01.mp3') == ('generated', '01.mp3')
    assert c('Alaric', 'qwen_01.mp3') == ('generated', 'qwen_01.mp3')
    assert c('Alaric', 'Alaric_1.mp3') == ('gen_selected', 'Alaric_1.mp3')


def test_mp3_classify_duplicate_name():
    assert voice_sync.mp3_classify(
        'Captain Belmont', 'Captain Captain Belmont.mp3') == \
        ('gen_selected', 'Captain Belmont.mp3')
    assert voice_sync.mp3_classify(
        'Generic Female Mature', 'Generic Female Generic Female Mature.mp3') == \
        ('gen_selected', 'Generic Female Mature.mp3')
    assert voice_sync.mp3_classify(
        'King Orwell Rose', 'King Orwell King Orwell Rose.mp3') == \
        ('gen_selected', 'King Orwell Rose.mp3')
    assert voice_sync.mp3_classify(
        'Shah Mahda', 'Shah Shah Mahda.mp3') == \
        ('gen_selected', 'Shah Mahda.mp3')


def test_mp3_classify_name_prefix_number():
    assert voice_sync.mp3_classify('Duke Antonio', 'Duke 01.mp3') == \
        ('generated', '01.mp3')
    assert voice_sync.mp3_classify('Marshal Edmond', 'Marshal 03.mp3') == \
        ('generated', '03.mp3')


def patch_all_paths(monkeypatch, tmp_path):
    """Подменяет ВСЕ пути voicekit на tmp (защита реального проекта)."""
    for attr, val in (
        ('ROOT', tmp_path),
        ('VOICE_CANDIDATES', tmp_path / 'voice_candidates'),
        ('CATALOG_DIR', tmp_path / 'catalog'),
        ('CONFIG_DIR', tmp_path / 'config'),
        ('VOICES_JSON', tmp_path / 'catalog' / 'voices.json'),
        ('VOICE_LIST_JSON', tmp_path / 'catalog' / 'voice_list.json'),
        ('CAST_SUMMARY_YAML', tmp_path / 'voice_candidates'
         / 'voice_candidates.yaml'),
        ('MISSING_VOICES_MD', tmp_path / 'catalog' / 'missing_voices.md'),
        ('SYNC_REPORT_MD', tmp_path / 'catalog' / 'voice_sync_report.md'),
    ):
        monkeypatch.setattr(paths, attr, str(val))


@pytest.fixture
def tmp_layout(tmp_path, monkeypatch):
    """Старая раскладка (ref/ + in_progress/) для миграции в корень."""
    vc = tmp_path / 'voice_candidates'
    for name in ('Alaric', 'Carolyn', 'Duke Antonio', 'Gorak', 'Samayra'):
        d = vc / name
        d.mkdir(parents=True)
        (d / (name + '.yaml')).write_text(
            'name: {}\ngender: M\n'.format(name), encoding='utf-8')

    (vc / 'Alaric' / 'ref').mkdir()
    (vc / 'Alaric' / 'ref' / 'Alaric.wav').write_bytes(b'RIFF')
    (vc / 'Carolyn' / 'ref').mkdir()
    (vc / 'Carolyn' / 'ref' / 'Carolyn.wav').write_bytes(b'RIFF')
    (vc / 'Carolyn' / 'in_progress').mkdir()
    (vc / 'Carolyn' / 'in_progress' / 'Carolyn_1.wav').write_bytes(b'RIFF')
    (vc / 'Duke Antonio' / 'ref').mkdir()
    (vc / 'Duke Antonio' / 'ref' / 'Duke Antonio.wav').write_bytes(b'RIFF')
    (vc / 'Gorak' / 'in_progress').mkdir()
    (vc / 'Gorak' / 'in_progress' / 'Gorak_u3.wav').write_bytes(b'RIFF')
    (vc / 'Samayra' / 'ref').mkdir()
    (vc / 'Samayra' / 'ref' / 'Carolyn.wav').write_bytes(b'RIFF')

    (tmp_path / 'catalog').mkdir()
    with open(tmp_path / 'catalog' / 'voices.json', 'w',
              encoding='utf-8') as f:
        import json
        json.dump({'entries': [], 'characters': {}}, f)

    patch_all_paths(monkeypatch, tmp_path)
    return tmp_path


def test_migrate_apply_moves_files(tmp_layout):
    voice_sync.cmd_migrate(type('A', (), {'apply': True})())
    vc = tmp_layout / 'voice_candidates'
    assert (vc / 'Alaric' / 'Alaric.wav').exists()
    assert not (vc / 'Alaric' / 'ref').exists()
    assert (vc / 'Carolyn' / 'Carolyn.wav').exists()
    assert (vc / 'Carolyn' / 'Carolyn_1.wav').exists()
    assert not (vc / 'Carolyn' / 'ref').exists()
    assert not (vc / 'Carolyn' / 'in_progress').exists()
    assert (vc / 'Gorak' / 'Gorak_u3.wav').exists()
    assert not (vc / 'Gorak' / 'in_progress').exists()
    assert (vc / 'Samayra' / 'Carolyn.wav').exists()
    assert 'Alaric' in voice_sync.catalog.load_voices()
    assert 'Carolyn' in voice_sync.catalog.load_voices()


def test_migrate_dry_run_changes_nothing(tmp_layout):
    voice_sync.cmd_migrate(type('A', (), {'apply': False})())
    assert (tmp_layout / 'voice_candidates' / 'Alaric' / 'ref'
            / 'Alaric.wav').exists()
    assert not (tmp_layout / 'voice_candidates' / 'Alaric'
                / 'Alaric.wav').exists()


def test_ref_files(tmp_layout):
    voice_sync.cmd_migrate(type('A', (), {'apply': True})())
    assert 'Alaric.wav' in voice_sync.ref_files('Alaric')
    assert 'Carolyn_1.wav' in voice_sync.ref_files('Carolyn')
    assert voice_sync.count_ref_files('Gorak') == 1


def test_update_creates_structure(tmp_path, monkeypatch):
    patch_all_paths(monkeypatch, tmp_path)
    vc = paths.VOICE_CANDIDATES
    os.makedirs(vc, exist_ok=True)
    os.makedirs(paths.CONFIG_DIR, exist_ok=True)
    os.makedirs(paths.CATALOG_DIR, exist_ok=True)
    import json
    with open(paths.VOICES_JSON, 'w', encoding='utf-8') as f:
        json.dump({'entries': [], 'characters': {'zz': 'Zed'}}, f)

    voice_sync.cmd_update(type('A', (), {'apply': True})())
    d = os.path.join(vc, 'Zed')
    assert os.path.isdir(d)
    assert all(os.path.isdir(os.path.join(d, sub))
               for sub in paths.CHAR_SUBDIRS)
    assert os.path.exists(os.path.join(d, 'Zed.yaml'))
    cast = voice_sync.catalog.load_cast('Zed')
    assert cast['name'] == 'Zed'
    assert cast['texts'] == []