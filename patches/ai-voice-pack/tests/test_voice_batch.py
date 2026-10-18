"""Тесты для tools/voice_batch.py — разрешение рефов и генерация.

Новая структура: реф = voice_candidates/{Name}/{Name}.wav (правило, не запись
в yaml); персонаж без записи в voices.yaml НЕ озвучивается.
"""

import os
import sys
import yaml
import pytest
from unittest.mock import MagicMock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

cosyvoice_modules = [
    'cosyvoice', 'cosyvoice.cli', 'cosyvoice.cli.cosyvoice',
    'cosyvoice.utils', 'cosyvoice.utils.file_utils', 'cosyvoice.utils.common',
    'hyperpyyaml', 'torch', 'torchaudio',
]
for mod in cosyvoice_modules:
    sys.modules[mod] = MagicMock()

sys.path.insert(0, os.path.join(ROOT, 'tools'))

from voicekit import paths  # noqa: E402


@pytest.fixture
def mock_config(tmp_path, monkeypatch):
    """Временная раскладка: config/, catalog/, voice_candidates/."""
    for attr, val in (
        ('ROOT', tmp_path),
        ('VOICE_CANDIDATES', tmp_path / 'voice_candidates'),
        ('CATALOG_DIR', tmp_path / 'catalog'),
        ('CONFIG_DIR', tmp_path / 'config'),
        ('VOICES_JSON', tmp_path / 'catalog' / 'voices.json'),
        ('VOICE_LIST_JSON', tmp_path / 'catalog' / 'voice_list.json'),
        ('AI_VOICE_DIR', tmp_path / 'ai_voice'),
    ):
        monkeypatch.setattr(paths, attr, str(val))

    (tmp_path / 'catalog').mkdir()
    ref_dir = tmp_path / 'voice_candidates' / 'TestVoice'
    ref_dir.mkdir(parents=True)
    (ref_dir / 'TestVoice.yaml').write_text(
        'name: TestVoice\nwho_codes: [tv]\n', encoding='utf-8')

    catalog = {
        'entries': [
            {
                'uid': 'test_uid_001', 'arc': 'TestArc', 'who': 'tv',
                'who_name': 'TestVoice', 'category': 'dialogue',
                'old': 'Hello world', 'new': 'Привет мир'
            },
            {
                'uid': 'test_uid_002', 'arc': 'TestArc', 'who': 'nr',
                'who_name': 'NoRefVoice', 'category': 'dialogue',
                'old': 'Goodbye', 'new': 'Пока'
            },
            {
                'uid': 'test_uid_003', 'arc': 'TestArc', 'who': None,
                'who_name': None, 'category': 'narration',
                'old': 'Narrator speaks', 'new': 'Рассказчик говорит'
            }
        ],
        'characters': {'tv': 'TestVoice', 'nr': 'NoRefVoice'}
    }
    import json
    with open(tmp_path / 'catalog' / 'voices.json', 'w',
              encoding='utf-8') as f:
        json.dump(catalog, f, ensure_ascii=False)

    wav = ref_dir / 'TestVoice.wav'
    wav.write_bytes(b'RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00'
                    b'\x01\x00\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00'
                    b'data\x00\x00\x00\x00')
    return tmp_path


def make_args(**kw):
    defaults = dict(arc=None, char=None, uid=None, lang='ru', ref=None,
                    emotion=None, emotion_ru=None, no_emotion=False, text=None)
    defaults.update(kw)
    return type('Args', (), defaults)


def test_load_inputs(mock_config):
    import voice_batch
    entries, voices, who_to_voice = voice_batch.load_inputs()
    assert len(entries) == 3
    assert 'TestVoice' in voices
    assert who_to_voice.get('tv') == 'TestVoice'


def test_select_phrases_with_ref(mock_config):
    import voice_batch
    entries, voices, who_to_voice = voice_batch.load_inputs()
    phrases = voice_batch.select_phrases(
        entries, voices, who_to_voice, make_args(char='TestVoice'))
    assert len(phrases) == 1
    assert phrases[0]['uid'] == 'test_uid_001'
    assert phrases[0]['voice'] == 'TestVoice'
    assert phrases[0]['ref'].endswith('voice_candidates/TestVoice/TestVoice.wav')


def test_select_phrases_skips_unlisted(mock_config):
    import voice_batch
    entries, voices, who_to_voice = voice_batch.load_inputs()
    phrases = voice_batch.select_phrases(
        entries, voices, who_to_voice, make_args())
    no_ref = [p for p in phrases if p['voice'] == 'NoRefVoice']
    assert no_ref == []


def test_select_phrases_narration(mock_config, tmp_path):
    import voice_batch
    nd = tmp_path / 'voice_candidates' / 'Narrator'
    nd.mkdir(parents=True)
    (nd / 'Narrator.yaml').write_text(
        'name: Narrator\nwho_codes: [narrator]\n', encoding='utf-8')
    (nd / 'Narrator.wav').write_bytes(b'RIFF')

    entries, voices, who_to_voice = voice_batch.load_inputs()
    phrases = voice_batch.select_phrases(
        entries, voices, who_to_voice, make_args())
    narration = [p for p in phrases if p['uid'] == 'test_uid_003']
    assert len(narration) == 1


def test_override_ref_via_args(mock_config):
    import voice_batch
    entries, voices, who_to_voice = voice_batch.load_inputs()
    phrases = voice_batch.select_phrases(
        entries, voices, who_to_voice,
        make_args(char='TestVoice',
                  ref='voice_candidates/TestVoice/TestVoice_1.wav'))
    assert len(phrases) == 1
    assert 'TestVoice_1.wav' in phrases[0]['ref']


def test_write_manifest(mock_config):
    """Манифест рядом с wav: uid/emotion/texts."""
    import voice_batch
    p = dict(
        uid='test_uid_001', arc='TestArc', voice='TestVoice',
        variant='TestVoice', lang='ru',
        ref=os.path.join(paths.ROOT,
                         'voice_candidates/TestVoice/TestVoice.wav'),
        out=os.path.join(paths.ROOT, 'ai_voice/ru/TestArc',
                         'test_uid_001__TestVoice.wav'),
        text_new='Привет мир', text_old='Hello world', emotion=None,
        emotion_ru=None)
    voice_batch.write_manifest(
        p, type('A', (), {'seed': 42, 'flow_temp': 1.2, 'cfg_rate': 0.9,
                          'top_p': 0.5, 'top_k': 10, 'tau_r': 0.15})())
    manifest = p['out'] + '.txt'
    assert os.path.exists(manifest)
    content = open(manifest, encoding='utf-8').read()
    assert 'uid: test_uid_001' in content
    assert 'ref: voice_candidates/TestVoice/TestVoice.wav' in content
    assert 'emotion: -' in content
    assert 'text_ru: Привет мир' in content
    assert 'text_en: Hello world' in content
    assert 'seed 42' in content