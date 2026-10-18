"""Тесты для tools/voice_manage.py — выбор активного рефа.

Структура: select копирует {Name}_{v}.wav -> {Name}.wav в корне каста.
"""

import os
import sys
import shutil
import yaml
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))

from voicekit import paths  # noqa: E402


@pytest.fixture
def tmp_project(tmp_path, monkeypatch):
    """Временная раскладка проекта для тестов."""
    for attr, val in (
        ('ROOT', tmp_path),
        ('VOICE_CANDIDATES', tmp_path / 'voice_candidates'),
        ('CATALOG_DIR', tmp_path / 'catalog'),
        ('CONFIG_DIR', tmp_path / 'config'),
        ('VOICES_JSON', tmp_path / 'catalog' / 'voices.json'),
    ):
        monkeypatch.setattr(paths, attr, str(val))

    (tmp_path / 'catalog').mkdir()
    char_dir = tmp_path / 'voice_candidates' / 'TestVoice'
    char_dir.mkdir(parents=True)
    (char_dir / 'TestVoice.yaml').write_text(
        'name: TestVoice\nwho_codes: [tv]\n', encoding='utf-8')

    wav_active = char_dir / 'TestVoice.wav'
    wav_active.write_bytes(b'RIFFactive')

    wav_v1 = char_dir / 'TestVoice_1.wav'
    wav_v1.write_bytes(b'RIFFvariant1')
    wav_v2 = char_dir / 'TestVoice_2.wav'
    wav_v2.write_bytes(b'RIFFvariant2')

    import json
    with open(tmp_path / 'catalog' / 'voices.json', 'w',
              encoding='utf-8') as f:
        json.dump({'entries': [], 'characters': {}}, f)
    return tmp_path


def test_load_cfg(tmp_project):
    from voicekit import catalog
    voices = catalog.load_voices()
    assert 'TestVoice' in voices
    assert voices['TestVoice']['who'] == ['tv']


def test_select_variant(tmp_project, monkeypatch):
    """select 1: копирует TestVoice_1.wav -> TestVoice.wav (корень каста)."""
    import voice_manage
    rc = voice_manage.cmd_select(
        type('A', (), {'name': 'TestVoice', 'variant': '1'}))
    assert rc == 0

    dst = paths.ref_active('TestVoice')
    assert os.path.exists(dst)
    assert open(dst, 'rb').read() == b'RIFFvariant1'


def test_select_nonexistent_variant(tmp_project):
    import voice_manage
    rc = voice_manage.cmd_select(
        type('A', (), {'name': 'TestVoice', 'variant': '999'}))
    assert rc == 1


def test_select_unknown_voice(tmp_project):
    import voice_manage
    rc = voice_manage.cmd_select(
        type('A', (), {'name': 'Nobody', 'variant': '1'}))
    assert rc == 1


def test_list_variants(tmp_project, capsys):
    import voice_manage
    voice_manage.cmd_list(type('A', (), {}))
    captured = capsys.readouterr()
    assert 'TestVoice' in captured.out
    assert 'варианты: TestVoice_1, TestVoice_2' in captured.out


def test_status(tmp_project, capsys):
    import voice_manage
    voice_manage.cmd_status(type('A', (), {}))
    captured = capsys.readouterr()
    assert '[OK] TestVoice' in captured.out