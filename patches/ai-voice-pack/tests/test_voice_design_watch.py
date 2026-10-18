"""Тесты voice_design_watch: подсчёт цели и прогресса."""

import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))

from voicekit import paths  # noqa: E402
import voice_design_watch as watch  # noqa: E402


@pytest.fixture
def tmp_layout(tmp_path, monkeypatch):
    for attr, val in (
        ('ROOT', tmp_path),
        ('VOICE_CANDIDATES', tmp_path / 'voice_candidates'),
        ('CATALOG_DIR', tmp_path / 'catalog'),
        ('CONFIG_DIR', tmp_path / 'config'),
        ('VOICES_JSON', tmp_path / 'catalog' / 'voices.json'),
        ('OUTPUT_DIR', tmp_path / 'output'),
    ):
        monkeypatch.setattr(paths, attr, str(val))
    os.makedirs(paths.CATALOG_DIR, exist_ok=True)
    os.makedirs(paths.CONFIG_DIR, exist_ok=True)
    import json
    with open(paths.VOICES_JSON, 'w', encoding='utf-8') as f:
        json.dump({'entries': [], 'characters': {}}, f)
    return tmp_path


def test_target_and_current(tmp_layout):
    d = paths.char_dir('TestVoice')
    os.makedirs(paths.char_subdir('TestVoice', 'generated'), exist_ok=True)
    import yaml
    with open(paths.char_yaml('TestVoice'), 'w', encoding='utf-8') as f:
        yaml.dump({'name': 'TestVoice', 'texts': ['Фраза один.']}, f)

    assert watch.target_count() == watch.N
    assert watch.current_count()[0] == 0

    for i in range(3):
        open(os.path.join(paths.char_subdir('TestVoice', 'generated'),
                          '{:02d}.mp3'.format(i + 1)), 'w').close()
    assert watch.current_count()[0] == 3
    assert watch.last_mp3_mtime() > 0


def test_target_ignores_stubs(tmp_layout):
    """Касты без texts не учитываются в цели."""
    d = paths.char_dir('Stub')
    os.makedirs(paths.char_subdir('Stub', 'generated'), exist_ok=True)
    import yaml
    with open(paths.char_yaml('Stub'), 'w', encoding='utf-8') as f:
        yaml.dump({'name': 'Stub', 'texts': []}, f)
    assert watch.target_count() == 0