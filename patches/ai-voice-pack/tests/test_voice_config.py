"""Тесты voicekit.config: загрузка карты конфигов."""

import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))

from voicekit import config  # noqa: E402


def test_load_real_config():
    cfg = config.load()
    assert isinstance(cfg, dict)
    assert 'audio' in cfg
    assert 'design' in cfg
    assert 'batch' in cfg
    assert 'beastify' in cfg
    assert cfg['audio']['loudness']['i'] == -16.0


def test_section_and_preset():
    assert config.section('no_such_section') == {}
    pr = config.preset('beastify', 'orc')
    assert pr['k'] == 0.84
    assert pr['sub_hz'] == 75
    assert config.preset('beastify', 'nope') == {}


def test_get_with_default():
    assert config.get('design', 'temperature', 0.5) == 0.9
    assert config.get('design', 'missing', 'dflt') == 'dflt'
    assert config.get('audio', 'sr', 0) == 24000


def test_missing_file_fallback(tmp_path, monkeypatch):
    monkeypatch.setattr(config, '_CACHE', None)
    monkeypatch.setattr('voicekit.paths.CONFIG_DIR', str(tmp_path / 'nope'))
    assert config.load() == {}
    assert config.section('batch') == {}
    assert config.preset('beastify', 'orc') == {}
    monkeypatch.setattr(config, '_CACHE', None)
